import '@testing-library/jest-dom';

// Simple mock for the "sentiment" package so tests don't require the actual dependency
jest.mock('sentiment', () => {
  return jest.fn().mockImplementation(() => ({
    analyze: (text: string) => {
      if (/good|great|love/i.test(text)) return { score: 3 };
      if (/bad|terrible|hate/i.test(text)) return { score: -3 };
      return { score: 0 };
    },
  }));
});
