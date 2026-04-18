import { CookieJar } from 'tough-cookie';
import type { Middleware } from 'openapi-fetch';

/**
 * Build an openapi-fetch middleware that persists Set-Cookie headers across
 * requests using an in-memory tough-cookie jar. Used by the /auth/request →
 * /api/actors/me session flow in Node environments (browsers handle cookies
 * natively).
 */
export function makeCookieJarMiddleware(jar = new CookieJar()): Middleware {
  return {
    async onRequest({ request }) {
      const cookieHeader = await jar.getCookieString(request.url);
      if (cookieHeader) {
        request.headers.set('Cookie', cookieHeader);
      }
      return request;
    },
    async onResponse({ response, request }) {
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        for (const cookie of splitSetCookieHeader(setCookie)) {
          await jar.setCookie(cookie, request.url);
        }
      }
      return response;
    },
  };
}

function splitSetCookieHeader(value: string): string[] {
  // Set-Cookie values can include commas inside expires/date attributes,
  // which is why most stdlibs expose the raw header array separately. Node's
  // fetch flattens to a single string. Split on commas that are followed by
  // a cookie-attribute-looking prefix (word chars + '=').
  return value.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
}
