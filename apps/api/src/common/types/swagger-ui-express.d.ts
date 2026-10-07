declare module 'swagger-ui-express' {
  import type { RequestHandler } from 'express';

  interface SwaggerUi {
    serve: RequestHandler[];
    setup(document: object, options?: { customSiteTitle?: string }): RequestHandler;
  }

  const swaggerUi: SwaggerUi;
  export default swaggerUi;
}
