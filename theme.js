// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const IFACE_SCHEMA = 'org.gnome.desktop.interface';
const THEME_DIRS = [
    GLib.build_filenamev([GLib.get_home_dir(), '.themes']),
    GLib.build_filenamev([GLib.get_user_data_dir(), 'themes']),
    '/usr/share/themes',
];

function themeExists(name) {
    return THEME_DIRS.some(dir => GLib.file_test(GLib.build_filenamev([dir, name]), GLib.FileTest.IS_DIR));
}

// Find the GTK theme variant matching the requested scheme, e.g.
// Mojave-dark-solid <-> Mojave-light-solid, Yaru-blue-dark <-> Yaru-blue.
function counterpartTheme(name, wantDark) {
    const candidates = wantDark
        ? [name.replace(/light/i, 'dark'), `${name}-dark`, name.replace(/-light/i, '')]
        : [name.replace(/dark/i, 'light'), name.replace(/-dark/i, '')];
    return candidates.find(c => c !== name && themeExists(c)) ?? null;
}

export class ThemeController {
    constructor(onChange) {
        this._settings = new Gio.Settings({schema_id: IFACE_SCHEMA});
        this._signal = this._settings.connect('changed::color-scheme', () => onChange(this.isDark));
    }

    get isDark() {
        return this._settings.get_string('color-scheme') === 'prefer-dark';
    }

    toggle() {
        const wantDark = !this.isDark;
        this._settings.set_string('color-scheme', wantDark ? 'prefer-dark' : 'default');
        const gtkTheme = this._settings.get_string('gtk-theme');
        const next = counterpartTheme(gtkTheme, wantDark);
        if (next)
            this._settings.set_string('gtk-theme', next);
    }

    destroy() {
        this._settings.disconnect(this._signal);
        this._settings = null;
    }
}
