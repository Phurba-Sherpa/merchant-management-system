import { ValueTransformer } from 'typeorm';

export class ColumnNumericTransformer implements ValueTransformer {
  to(data?: number | null): string | null {
    if (data === null || data === undefined) {
      return null;
    }
    return data.toString();
  }

  from(data?: string | null): number | null {
    if (data === null || data === undefined) {
      return null;
    }
    const parsed = parseInt(data, 10);
    return isNaN(parsed) ? null : parsed;
  }
}
