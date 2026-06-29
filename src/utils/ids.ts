let counter = 0;

export function generateId(): string {
  counter++;
  return `id_${Date.now()}_${counter}`;
}

export function resetIdCounter(): void {
  counter = 0;
}

