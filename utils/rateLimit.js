// 🔒 Rate Limiting Middleware
// Simple in-memory rate limiter for Vercel serverless functions

const rateLimitStore = new Map();

export function createRateLimiter(maxRequests = 5, windowMs = 60000) {
  return function rateLimit(req, res, next) {
    const clientIP = req.headers['x-forwarded-for'] || 
                    req.headers['x-real-ip'] || 
                    req.connection?.remoteAddress || 
                    'unknown';
    
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get client's request history
    if (!rateLimitStore.has(clientIP)) {
      rateLimitStore.set(clientIP, []);
    }
    
    const clientRequests = rateLimitStore.get(clientIP);
    
    // Remove old requests outside the window
    const validRequests = clientRequests.filter(timestamp => timestamp > windowStart);
    
    // Check if client has exceeded the limit
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds.`,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Add current request timestamp
    validRequests.push(now);
    rateLimitStore.set(clientIP, validRequests);
    
    // Clean up old entries to prevent memory leaks
    if (rateLimitStore.size > 1000) {
      const oldestAllowed = now - (windowMs * 10);
      for (const [ip, requests] of rateLimitStore.entries()) {
        const valid = requests.filter(timestamp => timestamp > oldestAllowed);
        if (valid.length === 0) {
          rateLimitStore.delete(ip);
        } else {
          rateLimitStore.set(ip, valid);
        }
      }
    }
    
    if (next) next();
  };
}

// Export default rate limiter: 5 requests per minute
export const defaultRateLimit = createRateLimiter(5, 60000);

// Stricter rate limiter for download endpoints: 10 requests per minute
export const downloadRateLimit = createRateLimiter(10, 60000);
