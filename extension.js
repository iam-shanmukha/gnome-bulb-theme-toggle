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
        const cr = area.get_context();
        const [w] = area.get_surface_size();
        const ax = w / 2;
        drawBulb(cr, {
            ax, ay: 0, bx: ax, by: GEOMETRY.restCord * this._scale,
            on: this._lit, cordColor: this._cordColor(), scale: this._scale,
        });
        cr.$dispose();
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
        const s = this._scale;
        const [ax0, ay0] = this._area.get_transformed_position();
        const [aw] = this._area.get_transformed_size();
        this._anchor = {x: ax0 + aw / 2, y: ay0};
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
        const pad = (MAX_SWAY + GEOMETRY.radius * 3) * s;
        this._canvas = new St.DrawingArea({
            x: this._anchor.x - pad,
            y: this._anchor.y,
            width: pad * 2,
            height: (MAX_PULL + GEOMETRY.radius * 3) * s + bulbExtent(s),
        });
        this._canvas.connect('repaint', area => this._paintPulled(area, pad));
        this._overlay.add_child(this._canvas);
        Main.layoutManager.uiGroup.add_child(this._overlay);

        this._overlay.connect('motion-event', (_a, e) => this._onMotion(e));
        this._overlay.connect('touch-event', (_a, e) => this._onTouch(e));
        this._overlay.connect('button-release-event', () => this._endPull());

        this._grab = global.stage.grab(this._overlay);
        this._area.opacity = 0;
    }

    _onTouch(e) {
        const t = e.type();
        if (t === Clutter.EventType.TOUCH_UPDATE)
            return this._onMotion(e);
        if (t === Clutter.EventType.TOUCH_END || t === Clutter.EventType.TOUCH_CANCEL)
            return this._endPull();
        return Clutter.EVENT_STOP;
    }

    _onMotion(e) {
        if (this._springing)
            return Clutter.EVENT_STOP;
        const s = this._scale;
        const [x, y] = e.get_coords();
        const rawY = Math.max(0, y - this._startY);
        const rawX = x - this._startX;
        if (Math.hypot(rawX, rawY) > CLICK_SLOP * s)
            this._moved = true;
        const max = MAX_PULL * s, sway = MAX_SWAY * s;
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

        const s = this._scale;
        const toggled = !this._moved || this._pull.dy >= TOGGLE_PULL * s;
        if (!this._moved)
            this._pull = {dx: 0, dy: TOGGLE_PULL * 0.6 * s}; // a little tug for clicks
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
        this._timeline.connect('new-frame', tl => {
            const t = tl.get_elapsed_time() / 1000;
            this._pull = {
                dy: Math.max(minDy, from.dy * Math.exp(-6 * t) * Math.cos(16 * t)),
                dx: from.dx * Math.exp(-4 * t) * Math.cos(11 * t),
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
        const cr = area.get_context();
        const s = this._scale;
        drawBulb(cr, {
            ax: pad, ay: 0,
            bx: pad + this._pull.dx,
            by: GEOMETRY.restCord * s + this._pull.dy,
            on: this._lit, cordColor: this._cordColor(), scale: s,
        });
        cr.$dispose();
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
