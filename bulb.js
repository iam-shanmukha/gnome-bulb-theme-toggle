// SPDX-License-Identifier: GPL-2.0-or-later
import Cairo from 'cairo';

// Cairo drawing of a bulb hanging from a cord anchored at (ax, ay).
// The cord ends at (bx, by); the bulb is rotated to follow the cord.

export const GEOMETRY = {
    restCord: 11,   // cord length at rest (logical px)
    capW: 6,
    capH: 4,
    radius: 6,
};

export function bulbExtent(scale) {
    const g = GEOMETRY;
    return (g.restCord + g.capH + g.radius * 2 + 2) * scale;
}

export function drawBulb(cr, {ax, ay, bx, by, on, cordColor, scale}) {
    const g = GEOMETRY;
    const dx = bx - ax, dy = by - ay;
    const len = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dx, dy);

    cr.save();
    cr.translate(ax, ay);
    cr.rotate(-angle);

    // Cord
    cr.setSourceRGBA(cordColor.red / 255, cordColor.green / 255, cordColor.blue / 255, 0.85);
    cr.setLineWidth(1.2 * scale);
    cr.moveTo(0, 0);
    cr.lineTo(0, len);
    cr.stroke();

    const capW = g.capW * scale, capH = g.capH * scale, r = g.radius * scale;
    const cy = len + capH + r * 0.85;

    // Glow when lit
    if (on) {
        const glow = new Cairo.RadialGradient(0, cy, r * 0.4, 0, cy, r * 2.6);
        glow.addColorStopRGBA(0, 1, 0.85, 0.3, 0.55);
        glow.addColorStopRGBA(1, 1, 0.85, 0.3, 0);
        cr.setSource(glow);
        cr.arc(0, cy, r * 2.6, 0, 2 * Math.PI);
        cr.fill();
    }

    // Glass
    cr.arc(0, cy, r, 0, 2 * Math.PI);
    if (on)
        cr.setSourceRGBA(1, 0.84, 0.29, 1);
    else
        cr.setSourceRGBA(0.75, 0.75, 0.78, 0.25);
    cr.fillPreserve();
    cr.setLineWidth(1.2 * scale);
    if (on)
        cr.setSourceRGBA(1, 0.72, 0.1, 1);
    else
        cr.setSourceRGBA(cordColor.red / 255, cordColor.green / 255, cordColor.blue / 255, 0.8);
    cr.stroke();

    // Filament
    cr.setLineWidth(1 * scale);
    cr.setSourceRGBA(on ? 0.85 : 0.6, on ? 0.45 : 0.6, on ? 0 : 0.6, on ? 1 : 0.8);
    cr.moveTo(-r * 0.35, cy + r * 0.1);
    cr.lineTo(-r * 0.15, cy - r * 0.3);
    cr.lineTo(r * 0.15, cy + r * 0.1);
    cr.lineTo(r * 0.35, cy - r * 0.3);
    cr.stroke();

    // Socket cap (drawn last so it overlaps the glass top)
    cr.setSourceRGBA(0.55, 0.55, 0.58, 1);
    cr.rectangle(-capW / 2, len, capW, capH);
    cr.fill();
    cr.setSourceRGBA(0.35, 0.35, 0.38, 1);
    cr.setLineWidth(0.8 * scale);
    cr.moveTo(-capW / 2, len + capH / 2);
    cr.lineTo(capW / 2, len + capH / 2);
    cr.stroke();

    cr.restore();
}
