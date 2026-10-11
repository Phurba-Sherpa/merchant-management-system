import { maskTaxId, maskEmail, maskPhone } from './masking';

describe('Masking utilities', () => {
  it('masks business tax id correctly', () => {
    expect(maskTaxId('000000001')).toBe('*****0001');
    expect(maskTaxId('12345')).toBe('*2345');
    expect(maskTaxId('1234')).toBe('****');
    expect(maskTaxId(null)).toBeNull();
  });

  it('masks email correctly', () => {
    expect(maskEmail('owner@example.com')).toBe('o***@example.com');
    expect(maskEmail('a@b.com')).toBe('*@b.com');
    expect(maskEmail('invalid')).toBe('***');
    expect(maskEmail(null)).toBeNull();
  });

  it('masks phone correctly', () => {
    expect(maskPhone('+9779800000000')).toBe('*********0000');
    expect(maskPhone('1234567')).toBe('***4567');
    expect(maskPhone(null)).toBeNull();
  });
});
