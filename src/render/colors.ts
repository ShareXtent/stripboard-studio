function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function normalizeHexColor(color: string, fallback: string): string {
  const trimmed = color.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split('')
      .map((channel) => `${channel}${channel}`)
      .join('')}`;
  }

  return fallback;
}

function hexToRgb(color: string): [number, number, number] {
  const normalized = normalizeHexColor(color, '#000000');

  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixHex(color: string, target: string, ratio: number, fallback: string): string {
  const [red, green, blue] = hexToRgb(normalizeHexColor(color, fallback));
  const [targetRed, targetGreen, targetBlue] = hexToRgb(target);
  const safeRatio = Math.min(Math.max(ratio, 0), 1);

  return rgbToHex(
    red + (targetRed - red) * safeRatio,
    green + (targetGreen - green) * safeRatio,
    blue + (targetBlue - blue) * safeRatio
  );
}

export function getBoardFillColor(color: string): string {
  return normalizeHexColor(color, '#2d5a27');
}

export function getBoardOutlineColor(color: string): string {
  return mixHex(color, '#ffffff', 0.18, '#2d5a27');
}

export function getCopperFillColor(color: string): string {
  return normalizeHexColor(color, '#b87333');
}

export function getCopperStrokeColor(color: string): string {
  return mixHex(color, '#000000', 0.28, '#b87333');
}
