// SPDX-License-Identifier: GPL-2.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {ThemeController} from './theme.js';
import {GEOMETRY, bulbExtent, drawBulb} from './bulb.js';

const BUTTON_WIDTH = 22;     // logical px
const MAX_PULL = 140;        // rubber-band limit
const TOGGLE_PULL = 36;      // pull distance needed to flip the switch
const MAX_SWAY = 40;
const CLICK_SLOP = 4;        // movement below this counts as a click
const SPRING_MS = 1100;

const BulbButton = GObject.registerClass(
class BulbButton extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'Bulb Theme Toggle', true);
        this.add_style_class_name('bulb-theme-button');
        this._scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._theme = new ThemeController(() => this._area.queue_repaint());

        this._area = new St.DrawingArea({
            width: BUTTON_WIDTH * this._scale,
            y_expand: true,
        });
        this._area.connect('repaint', area => this._paintRest(area));
        this.add_child(this._area);
    }

    get _lit() {
        return !this._theme.isDark;
    }

    _cordColor() {
        return this.get_theme_node().get_foreground_color();
    }

    _paintRest(area) {
        const context = area.get_context();
        const [width] = area.get_surface_size();
        const centerX = width / 2;
        drawBulb(context, {
            anchorX: centerX, anchorY: 0,
            bulbX: centerX, bulbY: GEOMETRY.restCord * this._scale,
            lit: this._lit, cordColor: this._cordColor(), scale: this._scale,
        });
        context.$dispose();
    }

    vfunc_event(event) {
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_PRIMARY) {
            this._beginPull(event);
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.TOUCH_BEGIN) {
            this._beginPull(event);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    // --- Pull interaction -------------------------------------------------

    _beginPull(event) {
        if (this._overlay)
            return;
        const scale = this._scale;
        const [areaX, areaY] = this._area.get_transformed_position();
        const [areaWidth] = this._area.get_transformed_size();
        this._anchor = {x: areaX + areaWidth / 2, y: areaY};
        [this._startX, this._startY] = event.get_coords();
        this._pull = {dx: 0, dy: 0};
        this._moved = false;

        // Full-stage reactive catcher so we keep receiving motion anywhere.
        this._overlay = new St.Widget({
            reactive: true,
            x: 0, y: 0,
            width: global.stage.width,
            height: global.stage.height,
        });
        const pad = (MAX_SWAY + GEOMETRY.radius * 3) * scale;
        this._canvas = new St.DrawingArea({
            x: this._anchor.x - pad,
            y: this._anchor.y,
            width: pad * 2,
            height: (MAX_PULL + GEOMETRY.radius * 3) * scale + bulbExtent(scale),
        });
        this._canvas.connect('repaint', area => this._paintPulled(area, pad));
        this._overlay.add_child(this._canvas);
        Main.layoutManager.uiGroup.add_child(this._overlay);

        this._overlay.connect('motion-event', (_actor, motionEvent) => this._onMotion(motionEvent));
        this._overlay.connect('touch-event', (_actor, touchEvent) => this._onTouch(touchEvent));
        this._overlay.connect('button-release-event', () => this._endPull());

        this._grab = global.stage.grab(this._overlay);
        this._area.opacity = 0;
    }

    _onTouch(event) {
        const type = event.type();
        if (type === Clutter.EventType.TOUCH_UPDATE)
            return this._onMotion(event);
        if (type === Clutter.EventType.TOUCH_END || type === Clutter.EventType.TOUCH_CANCEL)
            return this._endPull();
        return Clutter.EVENT_STOP;
    }

    _onMotion(event) {
        if (this._springing)
            return Clutter.EVENT_STOP;
        const scale = this._scale;
        const [x, y] = event.get_coords();
        const rawY = Math.max(0, y - this._startY);
        const rawX = x - this._startX;
        if (Math.hypot(rawX, rawY) > CLICK_SLOP * scale)
            this._moved = true;
        const max = MAX_PULL * scale, sway = MAX_SWAY * scale;
        // Rubber-band: easy at first, stiffer as it stretches.
        this._pull = {
            dy: max * (1 - Math.exp(-rawY / max)),
            dx: sway * Math.tanh(rawX / sway),
        };
        this._canvas.queue_repaint();
        return Clutter.EVENT_STOP;
    }

    _endPull() {
        if (this._springing)
            return Clutter.EVENT_STOP;
        this._grab?.dismiss();
        this._grab = null;
        this._overlay.reactive = false;

        const scale = this._scale;
        const toggled = !this._moved || this._pull.dy >= TOGGLE_PULL * scale;
        if (!this._moved)
            this._pull = {dx: 0, dy: TOGGLE_PULL * 0.6 * scale}; // a little tug for clicks
        if (toggled)
            this._theme.toggle();
        this._springBack();
        return Clutter.EVENT_STOP;
    }

    _springBack() {
        this._springing = true;
        const from = {...this._pull};
        const minDy = -GEOMETRY.restCord * 0.4 * this._scale;
        this._timeline = new Clutter.Timeline({actor: this._canvas, duration: SPRING_MS});
        this._timeline.connect('new-frame', timeline => {
            const seconds = timeline.get_elapsed_time() / 1000;
            this._pull = {
                dy: Math.max(minDy, from.dy * Math.exp(-6 * seconds) * Math.cos(16 * seconds)),
                dx: from.dx * Math.exp(-4 * seconds) * Math.cos(11 * seconds),
            };
            this._canvas.queue_repaint();
        });
        this._timeline.connect('completed', () => this._finishPull());
        this._timeline.start();
    }

    _finishPull() {
        this._timeline = null;
        this._springing = false;
        this._overlay?.destroy();
        this._overlay = null;
        this._canvas = null;
        this._area.opacity = 255;
        this._area.queue_repaint();
    }

    _paintPulled(area, pad) {
        const context = area.get_context();
        drawBulb(context, {
            anchorX: pad, anchorY: 0,
            bulbX: pad + this._pull.dx,
            bulbY: GEOMETRY.restCord * this._scale + this._pull.dy,
            lit: this._lit, cordColor: this._cordColor(), scale: this._scale,
        });
        context.$dispose();
    }

    destroy() {
        this._timeline?.stop();
        this._grab?.dismiss();
        this._grab = null;
        this._overlay?.destroy();
        this._overlay = null;
        this._theme?.destroy();
        this._theme = null;
        super.destroy();
    }
});

export default class BulbThemeToggleExtension extends Extension {
    enable() {
        this._button = new BulbButton();
        Main.panel.addToStatusArea(this.uuid, this._button, 0, 'right');
    }

    disable() {
        this._button?.destroy();
        this._button = null;
    }
}
