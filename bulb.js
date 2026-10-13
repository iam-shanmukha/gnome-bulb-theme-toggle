// SPDX-License-Identifier: GPL-2.0-or-later
import Cairo from 'cairo';

// Cairo drawing of a bulb hanging from a cord anchored at (anchorX, anchorY).
// The cord ends at (bulbX, bulbY); the bulb is rotated to follow the cord.

export const GEOMETRY = {
    restCord: 11,   // cord length at rest (logical px)
    capWidth: 6,
    capHeight: 4,
    radius: 6,
};

export function bulbExtent(scale) {
    return (GEOMETRY.restCord + GEOMETRY.capHeight + GEOMETRY.radius * 2 + 2) * scale;
}

function setColor(context, color, alpha) {
    context.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, alpha);
}

function drawCord(context, length, cordColor, scale) {
    setColor(context, cordColor, 0.85);
    context.setLineWidth(1.2 * scale);
    context.moveTo(0, 0);
    context.lineTo(0, length);
    context.stroke();
}

function drawGlow(context, centerY, radius) {
    const glow = new Cairo.RadialGradient(0, centerY, radius * 0.4, 0, centerY, radius * 2.6);
    glow.addColorStopRGBA(0, 1, 0.85, 0.3, 0.55);
    glow.addColorStopRGBA(1, 1, 0.85, 0.3, 0);
    context.setSource(glow);
    context.arc(0, centerY, radius * 2.6, 0, 2 * Math.PI);
    context.fill();
}

function drawGlass(context, centerY, radius, lit, cordColor, scale) {
    context.arc(0, centerY, radius, 0, 2 * Math.PI);
    if (lit)
        context.setSourceRGBA(1, 0.84, 0.29, 1);
    else
        context.setSourceRGBA(0.75, 0.75, 0.78, 0.25);
    context.fillPreserve();

    context.setLineWidth(1.2 * scale);
    if (lit)
        context.setSourceRGBA(1, 0.72, 0.1, 1);
    else
        setColor(context, cordColor, 0.8);
    context.stroke();
}

function drawFilament(context, centerY, radius, lit, scale) {
    context.setLineWidth(scale);
    if (lit)
        context.setSourceRGBA(0.85, 0.45, 0, 1);
    else
        context.setSourceRGBA(0.6, 0.6, 0.6, 0.8);
    context.moveTo(-radius * 0.35, centerY + radius * 0.1);
    context.lineTo(-radius * 0.15, centerY - radius * 0.3);
    context.lineTo(radius * 0.15, centerY + radius * 0.1);
    context.lineTo(radius * 0.35, centerY - radius * 0.3);
    context.stroke();
}

function drawSocket(context, top, width, height, scale) {
    context.setSourceRGBA(0.55, 0.55, 0.58, 1);
    context.rectangle(-width / 2, top, width, height);
    context.fill();

    context.setSourceRGBA(0.35, 0.35, 0.38, 1);
    context.setLineWidth(0.8 * scale);
    context.moveTo(-width / 2, top + height / 2);
    context.lineTo(width / 2, top + height / 2);
    context.stroke();
}

export function drawBulb(context, {anchorX, anchorY, bulbX, bulbY, lit, cordColor, scale}) {
    const offsetX = bulbX - anchorX;
    const offsetY = bulbY - anchorY;
    const cordLength = Math.max(1, Math.hypot(offsetX, offsetY));
    const angle = Math.atan2(offsetX, offsetY);

    const capWidth = GEOMETRY.capWidth * scale;
    const capHeight = GEOMETRY.capHeight * scale;
    const radius = GEOMETRY.radius * scale;
    const centerY = cordLength + capHeight + radius * 0.85;

    context.save();
    context.translate(anchorX, anchorY);
    context.rotate(-angle);

    drawCord(context, cordLength, cordColor, scale);
    if (lit)
        drawGlow(context, centerY, radius);
    drawGlass(context, centerY, radius, lit, cordColor, scale);
    drawFilament(context, centerY, radius, lit, scale);
    // Socket last so it overlaps the top of the glass.
    drawSocket(context, cordLength, capWidth, capHeight, scale);

    context.restore();
}
