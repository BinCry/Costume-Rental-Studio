export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Costume Rental Studio API',
    version: '1.0.0',
    description:
      'HTTP API for Costume Rental Studio. Catalog endpoints require a Bearer access token.',
  },
  servers: [{ url: '/api/v1', description: 'Current server' }],
  tags: [
    {
      name: 'Catalog',
      description: 'Costume category, model, variant, accessory, and media management.',
    },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    parameters: {
      id: { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      modelId: {
        name: 'modelId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      variantId: {
        name: 'variantId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      listQuery: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: 'Use with pageSize, search, status, sortBy, and sortOrder.',
      },
    },
    schemas: {
      CatalogStatus: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
      CategoryInput: {
        type: 'object',
        required: ['name'],
        properties: {
          parentId: { type: 'string', format: 'uuid', nullable: true },
          name: { type: 'string', maxLength: 255 },
        },
      },
      ModelInput: {
        type: 'object',
        required: ['categoryId', 'modelCode', 'name'],
        properties: {
          categoryId: { type: 'string', format: 'uuid' },
          modelCode: { type: 'string', minLength: 2, maxLength: 50 },
          name: { type: 'string', maxLength: 255 },
          shortDescription: { type: 'string', nullable: true, maxLength: 500 },
          description: { type: 'string', nullable: true },
          material: { type: 'string', nullable: true, maxLength: 255 },
        },
      },
      VariantInput: {
        type: 'object',
        required: [
          'modelId',
          'variantCode',
          'sizeCode',
          'colorCode',
          'dailyRentalPriceVnd',
          'depositAmountVnd',
          'replacementValueVnd',
        ],
        properties: {
          modelId: { type: 'string', format: 'uuid' },
          variantCode: { type: 'string', minLength: 2, maxLength: 50 },
          sizeCode: { type: 'string', maxLength: 50 },
          colorCode: { type: 'string', maxLength: 50 },
          editionLabel: { type: 'string', nullable: true, maxLength: 100 },
          fitNotes: { type: 'string', nullable: true },
          dailyRentalPriceVnd: { type: 'string', example: '150000' },
          depositAmountVnd: { type: 'string', example: '500000' },
          replacementValueVnd: { type: 'string', example: '1500000' },
          cleaningBufferMinutes: { type: 'integer', nullable: true, minimum: 0 },
        },
      },
      AccessoryInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', maxLength: 255 },
          defaultQuantity: { type: 'integer', minimum: 1, default: 1 },
          replacementValueVnd: { type: 'string', nullable: true },
        },
      },
      MediaInput: {
        type: 'object',
        required: ['uploadKey'],
        properties: {
          uploadKey: {
            type: 'string',
            maxLength: 500,
            description: 'Temporary key returned by the presign endpoint',
          },
          sortOrder: { type: 'integer', minimum: 0, default: 0 },
          altText: { type: 'string', nullable: true, maxLength: 500 },
        },
      },
      UploadPresignInput: {
        type: 'object',
        required: ['purpose', 'ownerType', 'ownerId', 'contentType', 'size'],
        properties: {
          purpose: { type: 'string', enum: ['catalog-media'] },
          ownerType: { type: 'string', enum: ['model', 'variant'] },
          ownerId: { type: 'string', format: 'uuid' },
          contentType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] },
          size: { type: 'integer', minimum: 1, maximum: 10485760 },
        },
      },
      UploadPresignResponse: {
        type: 'object',
        required: ['objectKey', 'uploadUrl', 'method', 'fields', 'expiresAt'],
        properties: {
          objectKey: { type: 'string', example: 'catalog-staging/models/{modelId}/{uuid}.jpg' },
          uploadUrl: { type: 'string', format: 'uri' },
          method: { type: 'string', enum: ['POST'] },
          fields: {
            type: 'object',
            additionalProperties: { type: 'string' },
            example: { key: 'catalog-staging/models/{modelId}/{uuid}.jpg' },
          },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          statusCode: { type: 'integer' },
          error: { type: 'object' },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Invalid request or reference',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Unauthorized: {
        description: 'Authentication required',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Missing catalog permission',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Record not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Conflict: {
        description: 'Duplicate or invalid status transition',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  paths: {
    '/uploads/presign': {
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Create a temporary direct-upload URL for catalog media',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UploadPresignInput' } },
          },
        },
        responses: {
          '200': {
            description: 'Upload URL created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UploadPresignResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '503': { description: 'Object storage is not configured or unavailable' },
        },
      },
    },
    '/catalog/categories': {
      get: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'List categories',
        parameters: [{ $ref: '#/components/parameters/listQuery' }],
        responses: {
          '200': { description: 'Categories loaded' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Create category',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CategoryInput' } },
          },
        },
        responses: {
          '201': { description: 'Category created' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/catalog/categories/{id}': {
      get: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Get category',
        parameters: [{ $ref: '#/components/parameters/id' }],
        responses: {
          '200': { description: 'Category loaded' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Update category',
        parameters: [{ $ref: '#/components/parameters/id' }],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CategoryInput' } },
          },
        },
        responses: {
          '200': { description: 'Category updated' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/catalog/categories/{id}/{action}': {
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Activate or deactivate category',
        parameters: [
          { $ref: '#/components/parameters/id' },
          {
            name: 'action',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['activate', 'deactivate'] },
          },
        ],
        responses: {
          '200': { description: 'Category status updated' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/catalog/models': {
      get: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'List models',
        parameters: [
          { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { $ref: '#/components/parameters/listQuery' },
        ],
        responses: { '200': { description: 'Models loaded' } },
      },
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Create model in an active category',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ModelInput' } } },
        },
        responses: {
          '201': { description: 'Model created' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/catalog/models/{id}': {
      get: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Get model',
        parameters: [{ $ref: '#/components/parameters/id' }],
        responses: {
          '200': { description: 'Model loaded' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Update model',
        parameters: [{ $ref: '#/components/parameters/id' }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ModelInput' } } },
        },
        responses: { '200': { description: 'Model updated' } },
      },
    },
    '/catalog/models/{id}/{action}': {
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Activate or deactivate model',
        parameters: [
          { $ref: '#/components/parameters/id' },
          {
            name: 'action',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['activate', 'deactivate'] },
          },
        ],
        responses: {
          '200': { description: 'Model status updated' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/catalog/variants': {
      get: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'List variants',
        parameters: [
          { name: 'modelId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'sizeCode', in: 'query', schema: { type: 'string' } },
          { name: 'colorCode', in: 'query', schema: { type: 'string' } },
          { $ref: '#/components/parameters/listQuery' },
        ],
        responses: { '200': { description: 'Variants loaded' } },
      },
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Create variant in an active model',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/VariantInput' } },
          },
        },
        responses: {
          '201': { description: 'Variant created' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/catalog/variants/{id}': {
      get: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Get variant',
        parameters: [{ $ref: '#/components/parameters/id' }],
        responses: {
          '200': { description: 'Variant loaded' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Update variant',
        description:
          'Optional text fields may be set to null. Replacement value must be at least the deposit.',
        parameters: [{ $ref: '#/components/parameters/id' }],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/VariantInput' } },
          },
        },
        responses: {
          '200': { description: 'Variant updated' },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/catalog/variants/{id}/{action}': {
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Activate or deactivate variant',
        parameters: [
          { $ref: '#/components/parameters/id' },
          {
            name: 'action',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['activate', 'deactivate'] },
          },
        ],
        responses: { '200': { description: 'Variant status updated' } },
      },
    },
    '/catalog/models/{modelId}/accessories': {
      get: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'List model accessories',
        parameters: [{ $ref: '#/components/parameters/modelId' }],
        responses: { '200': { description: 'Accessories loaded' } },
      },
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Create accessory',
        parameters: [{ $ref: '#/components/parameters/modelId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AccessoryInput' } },
          },
        },
        responses: { '201': { description: 'Accessory created' } },
      },
    },
    '/catalog/accessories/{id}': {
      patch: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Update accessory',
        parameters: [{ $ref: '#/components/parameters/id' }],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AccessoryInput' } },
          },
        },
        responses: { '200': { description: 'Accessory updated' } },
      },
    },
    '/catalog/accessories/{id}/{action}': {
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Activate or deactivate accessory',
        parameters: [
          { $ref: '#/components/parameters/id' },
          {
            name: 'action',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['activate', 'deactivate'] },
          },
        ],
        responses: { '200': { description: 'Accessory status updated' } },
      },
    },
    '/catalog/models/{modelId}/media': {
      get: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'List model media',
        parameters: [{ $ref: '#/components/parameters/modelId' }],
        responses: { '200': { description: 'Media loaded' } },
      },
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Create model media',
        parameters: [{ $ref: '#/components/parameters/modelId' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MediaInput' } } },
        },
        responses: { '201': { description: 'Media created' } },
      },
    },
    '/catalog/variants/{variantId}/media': {
      get: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'List variant media',
        parameters: [{ $ref: '#/components/parameters/variantId' }],
        responses: { '200': { description: 'Media loaded' } },
      },
      post: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Create variant media',
        parameters: [{ $ref: '#/components/parameters/variantId' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MediaInput' } } },
        },
        responses: { '201': { description: 'Media created' } },
      },
    },
    '/catalog/media/{id}': {
      patch: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Update media sort order or alt text',
        parameters: [{ $ref: '#/components/parameters/id' }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  sortOrder: { type: 'integer', minimum: 0 },
                  altText: { type: 'string', nullable: true, maxLength: 500 },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Media updated' } },
      },
      delete: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete media',
        parameters: [{ $ref: '#/components/parameters/id' }],
        responses: { '204': { description: 'Media deleted' } },
      },
    },
  },
} as const;
