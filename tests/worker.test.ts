import { describe, it, expect } from 'vitest';
import { calculateP95, calculateTrendRatio } from '../src/worker/metrics';

describe('Worker Metrics', () => {
  describe('calculateP95', () => {
    it('should return 0 for empty array', () => {
      expect(calculateP95([])).toBe(0);
    });

    it('should return correct P95 for small array', () => {
      const latencies = [100, 200, 300, 400, 500];
      // P95 for 5 items: index = ceil(5 * 0.95) - 1 = 4
      expect(calculateP95(latencies)).toBe(500);
    });

    it('should return correct P95 for larger array', () => {
      const latencies = [100, 150, 200, 250, 300, 350, 400, 450, 500, 1000];
      // P95 for 10 items: index = ceil(10 * 0.95) - 1 = 9
      expect(calculateP95(latencies)).toBe(1000);
    });

    it('should handle unsorted array', () => {
      const latencies = [500, 100, 300, 200, 400];
      // Should sort and then get P95
      expect(calculateP95(latencies)).toBe(500);
    });

    it('should handle single item', () => {
      expect(calculateP95([100])).toBe(100);
    });
  });

  describe('calculateTrendRatio', () => {
    it('should return null when previous rate is null', () => {
      expect(calculateTrendRatio(0.05, null)).toBeNull();
    });

    it('should calculate correct ratio when error rate increases', () => {
      // Error rate went from 0.01 to 0.03 => ratio = 3.0
      const ratio = calculateTrendRatio(0.03, 0.01);
      expect(ratio).toBe(3.0);
    });

    it('should calculate correct ratio when error rate decreases', () => {
      // Error rate went from 0.03 to 0.01 => ratio = 0.33...
      const ratio = calculateTrendRatio(0.01, 0.03);
      expect(ratio).toBeCloseTo(0.333, 2);
    });

    it('should use epsilon when previous rate is 0', () => {
      // Previous was 0, current is 0.01
      // ratio = 0.01 / 0.001 = 10
      const ratio = calculateTrendRatio(0.01, 0);
      expect(ratio).toBe(10);
    });

    it('should return 0 when current rate is 0', () => {
      const ratio = calculateTrendRatio(0, 0.05);
      expect(ratio).toBe(0);
    });

    it('should handle same rates', () => {
      const ratio = calculateTrendRatio(0.02, 0.02);
      expect(ratio).toBe(1.0);
    });
  });
});
