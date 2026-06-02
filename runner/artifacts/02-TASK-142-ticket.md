# TASK-142 — Add @nestjs/config integration and Jest tests for environment-variable loading

**Problem:** The NestJS backend reads configuration values ad-hoc from process.env with no central validation or type-safe access layer. Missing or malformed env vars fail silently at runtime, and there is no test coverage to verify that required variables are loaded and validated at startup.

**In scope:** Install and wire @nestjs/config with ConfigModule.forRoot() in AppModule; Define a validated config schema (Joi or class-validator) covering all required env vars; Expose a typed configuration factory so services receive typed config via ConfigService; Write Jest unit tests verifying correct values are resolved from a valid env object; Write Jest unit tests verifying the app throws a descriptive error on missing required vars; Write Jest unit tests verifying the app throws a descriptive error on invalid var values
**Out of scope:** Linear.app API integration or credential management; Frontend or shared-types changes; Production secrets management (Vault, AWS SSM, etc.); Database or TypeORM connection changes; Any HTTP server e2e tests

## Changes
- **Backend:** Install @nestjs/config, Wire ConfigModule.forRoot({ validate }) into AppModule imports, Create src/config/configuration.ts — typed config factory function, Create src/config/env.validation.ts — Joi or class-validator schema for all env vars, Create src/config/configuration.spec.ts — Jest unit tests for valid, missing, and invalid env scenarios
- **Frontend:** 
- **Shared:** 

## Acceptance criteria
- **AC-1** — Given A complete and valid set of environment variables is supplied, when ConfigModule initialises with the validation schema, then ConfigService.get() returns each variable cast to its declared type without throwing.
- **AC-2** — Given A required environment variable is absent from process.env, when The NestJS module is instantiated in a Jest test, then Module initialisation throws an error whose message identifies the missing variable by name.
- **AC-3** — Given An environment variable is present but fails type or range validation (e.g. PORT='abc'), when The NestJS module is instantiated in a Jest test, then Module initialisation throws an error whose message identifies the offending variable and the constraint it violated.
- **AC-4** — Given ConfigModule is configured with a custom env object via ConfigModule.forRoot({ load: [...] }), when A Jest unit test creates a TestingModule and injects ConfigService, then ConfigService.get('KEY') returns the value from the injected object without starting a real HTTP listener.
- **AC-5** — Given The typed configuration factory is loaded, when A Jest unit test calls the factory function directly with a mock process.env, then The returned config object contains all expected keys with their correct TypeScript types as verified by strict equality assertions.