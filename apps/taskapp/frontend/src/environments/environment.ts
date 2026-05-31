// Default (production) environment. `ng build` uses this as-is; `ng serve` /
// `ng build --configuration development` replaces it with environment.development.ts
// via the `fileReplacements` entry in angular.json.
export const environment = {
  production: true,
  // Served same-origin behind a reverse proxy in production.
  apiUrl: 'http://localhost:3000/api',
};
