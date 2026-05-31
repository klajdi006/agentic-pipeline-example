// Development environment — talks directly to the NestJS backend on :3000.
// (The backend enables CORS for local dev. Prefer a dev-server proxy instead if you
// don't want CORS — see angular.json `serve` options.)
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
};
