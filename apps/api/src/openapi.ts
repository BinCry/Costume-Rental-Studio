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
    {
      name: 'Branches',
      description:
        'Global branch administration. GET requires branches.read.ALL; mutations require branches.manage.ALL.',
    },
    {
      name: 'Inventory',
      description:
        'Physical costume-unit lifecycle. Branch staff are limited to their assigned active branches; inventory ALL permissions can operate across branches.',
    },
    {
      name: 'Transfers',
      description:
        'Inter-branch stock transfers. The source requests and ships; the destination approves, rejects, and receives.',
    },
    {
      name: 'Rentals',
      description:
        'Rental-order lifecycle. Orders are created as PENDING_CONFIRMATION; staff confirms with physical-unit allocation, then processes pickup, return, and settlement.',
    },
    {
      name: 'Payments',
      description:
        'Rental payment and deposit-refund operations. Staff record cash immediately; customers or staff create payOS QR checkouts that are confirmed by signed webhooks.',
    },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    parameters: {
      id: { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      branchId: {
        name: 'branchId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
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
      unitId: {
        name: 'unitId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      transferId: {
        name: 'transferId',
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
      BranchStatus: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
      Branch: {
        type: 'object',
        required: [
          'id',
          'branchCode',
          'name',
          'address',
          'timezone',
          'status',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          branchCode: { type: 'string', example: 'HCM-Q1' },
          name: { type: 'string', maxLength: 255 },
          address: { type: 'string' },
          phone: { type: 'string', nullable: true, maxLength: 30 },
          timezone: { type: 'string', example: 'Asia/Ho_Chi_Minh' },
          status: { $ref: '#/components/schemas/BranchStatus' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UnitOperationalStatus: {
        type: 'string',
        enum: ['INBOUND', 'READY', 'CLEANING', 'REPAIR', 'IN_TRANSFER', 'RETIRED'],
      },
      CostumeConditionGrade: {
        type: 'string',
        enum: ['UNINSPECTED', 'NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'],
      },
      CostumeUnit: {
        type: 'object',
        required: [
          'id',
          'unitCode',
          'variantId',
          'currentBranchId',
          'conditionGrade',
          'operationalStatus',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          unitCode: { type: 'string', example: 'HCM-AODAI-001' },
          variantId: { type: 'string', format: 'uuid' },
          currentBranchId: { type: 'string', format: 'uuid' },
          conditionGrade: { $ref: '#/components/schemas/CostumeConditionGrade' },
          conditionNotes: { type: 'string', nullable: true },
          operationalStatus: { $ref: '#/components/schemas/UnitOperationalStatus' },
          acquiredAt: { type: 'string', format: 'date', nullable: true },
          acquisitionCostVnd: { type: 'string', nullable: true, example: '150000' },
          retiredAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      CreateCostumeUnitInput: {
        type: 'object',
        required: ['unitCode', 'variantId', 'branchId'],
        properties: {
          unitCode: { type: 'string', minLength: 2, maxLength: 50, pattern: '^[A-Za-z0-9-]+$' },
          variantId: { type: 'string', format: 'uuid' },
          branchId: { type: 'string', format: 'uuid' },
          acquiredAt: { type: 'string', format: 'date' },
          acquisitionCostVnd: { type: 'string', minimum: 0 },
          conditionNotes: { type: 'string', maxLength: 10000 },
        },
      },
      UpdateCostumeUnitInput: {
        type: 'object',
        description:
          'Only acquisition metadata and notes. unitCode, variantId, currentBranchId, condition and operationalStatus are managed by dedicated flows.',
        properties: {
          acquiredAt: { type: 'string', format: 'date', nullable: true },
          acquisitionCostVnd: { type: 'string', nullable: true, minimum: 0 },
          conditionNotes: { type: 'string', nullable: true, maxLength: 10000 },
        },
      },
      InspectCostumeUnitInput: {
        type: 'object',
        required: ['conditionGrade', 'nextStatus'],
        properties: {
          conditionGrade: { type: 'string', enum: ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] },
          nextStatus: { type: 'string', enum: ['READY', 'REPAIR'] },
          notes: { type: 'string', maxLength: 10000 },
        },
      },
      ChangeCostumeUnitStatusInput: {
        type: 'object',
        required: ['targetStatus'],
        properties: {
          targetStatus: { type: 'string', enum: ['READY', 'CLEANING', 'REPAIR'] },
          notes: { type: 'string', maxLength: 10000 },
        },
      },
      RetireCostumeUnitInput: {
        type: 'object',
        required: ['notes'],
        properties: { notes: { type: 'string', minLength: 1, maxLength: 10000 } },
      },
      TransferStatus: {
        type: 'string',
        enum: ['REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'REJECTED', 'CANCELLED'],
      },
      StockTransferItem: {
        type: 'object',
        required: ['id', 'transferId', 'unitId'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          transferId: { type: 'string', format: 'uuid' },
          unitId: { type: 'string', format: 'uuid' },
          conditionOut: { $ref: '#/components/schemas/CostumeConditionGrade' },
          conditionOutNotes: { type: 'string', nullable: true },
          conditionIn: { $ref: '#/components/schemas/CostumeConditionGrade' },
          conditionInNotes: { type: 'string', nullable: true },
          receivedOperationalStatus: { $ref: '#/components/schemas/UnitOperationalStatus' },
        },
      },
      StockTransfer: {
        type: 'object',
        required: [
          'id',
          'transferCode',
          'fromBranchId',
          'toBranchId',
          'status',
          'requestedBy',
          'version',
          'items',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          transferCode: { type: 'string', example: 'TRF-20261009-A1B2C3D4' },
          fromBranchId: { type: 'string', format: 'uuid' },
          toBranchId: { type: 'string', format: 'uuid' },
          status: { $ref: '#/components/schemas/TransferStatus' },
          requestNote: { type: 'string', nullable: true },
          requestedBy: { type: 'string', format: 'uuid' },
          approvedBy: { type: 'string', format: 'uuid', nullable: true },
          shippedBy: { type: 'string', format: 'uuid', nullable: true },
          receivedBy: { type: 'string', format: 'uuid', nullable: true },
          endedBy: { type: 'string', format: 'uuid', nullable: true },
          endReason: { type: 'string', nullable: true },
          version: { type: 'integer', minimum: 1 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          items: { type: 'array', items: { $ref: '#/components/schemas/StockTransferItem' } },
        },
      },
      CreateTransferInput: {
        type: 'object',
        required: ['fromBranchId', 'toBranchId', 'unitIds'],
        properties: {
          fromBranchId: { type: 'string', format: 'uuid' },
          toBranchId: { type: 'string', format: 'uuid' },
          unitIds: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: { type: 'string', format: 'uuid' },
          },
          requestNote: { type: 'string', maxLength: 10000 },
        },
      },
      UpdateTransferInput: {
        type: 'object',
        required: ['expectedVersion'],
        properties: {
          expectedVersion: { type: 'integer', minimum: 1 },
          requestNote: { type: 'string', nullable: true, maxLength: 10000 },
          unitIds: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: { type: 'string', format: 'uuid' },
          },
        },
      },
      TransferVersionInput: {
        type: 'object',
        required: ['expectedVersion'],
        properties: { expectedVersion: { type: 'integer', minimum: 1 } },
      },
      TransferEndInput: {
        type: 'object',
        required: ['expectedVersion', 'reason'],
        properties: {
          expectedVersion: { type: 'integer', minimum: 1 },
          reason: { type: 'string', minLength: 1, maxLength: 10000 },
        },
      },
      ShipTransferInput: {
        type: 'object',
        required: ['expectedVersion', 'items'],
        properties: {
          expectedVersion: { type: 'integer', minimum: 1 },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              required: ['unitId', 'conditionOut'],
              properties: {
                unitId: { type: 'string', format: 'uuid' },
                conditionOut: { type: 'string', enum: ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] },
                conditionOutNotes: { type: 'string', maxLength: 10000 },
              },
            },
          },
        },
      },
      ReceiveTransferInput: {
        type: 'object',
        required: ['expectedVersion', 'items'],
        properties: {
          expectedVersion: { type: 'integer', minimum: 1 },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              required: ['unitId', 'conditionIn', 'receivedOperationalStatus'],
              properties: {
                unitId: { type: 'string', format: 'uuid' },
                conditionIn: { type: 'string', enum: ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] },
                conditionInNotes: { type: 'string', maxLength: 10000 },
                receivedOperationalStatus: {
                  type: 'string',
                  enum: ['READY', 'CLEANING', 'REPAIR'],
                },
              },
            },
          },
        },
      },
      CreateBranchInput: {
        type: 'object',
        required: ['branchCode', 'name', 'address'],
        properties: {
          branchCode: { type: 'string', minLength: 2, maxLength: 50, pattern: '^[A-Za-z0-9-]+$' },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          address: { type: 'string', minLength: 1 },
          phone: { type: 'string', maxLength: 30 },
          timezone: {
            type: 'string',
            default: 'Asia/Ho_Chi_Minh',
            description: 'Valid IANA timezone',
          },
        },
      },
      UpdateBranchInput: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          address: { type: 'string', minLength: 1 },
          phone: { type: 'string', nullable: true, maxLength: 30 },
          timezone: { type: 'string', description: 'Valid IANA timezone' },
        },
      },
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
        description: 'Missing required permission',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Record not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Conflict: {
        description: 'Duplicate record or prohibited operation',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  paths: {
    '/rentals/availability': {
      get: {
        tags: ['Rentals'],
        security: [{ bearerAuth: [] }],
        summary: 'Check available costume units',
        responses: {
          '200': { description: 'Availability loaded' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/rentals/orders': {
      get: {
        tags: ['Rentals'],
        security: [{ bearerAuth: [] }],
        summary: 'List rental orders',
        responses: { '200': { description: 'Rental orders loaded' } },
      },
      post: {
        tags: ['Rentals'],
        security: [{ bearerAuth: [] }],
        summary: 'Create a rental order in PENDING_CONFIRMATION',
        responses: {
          '201': { description: 'Rental order created' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/rentals/orders/{orderId}': {
      get: {
        tags: ['Rentals'],
        security: [{ bearerAuth: [] }],
        summary: 'Get rental order',
        responses: {
          '200': { description: 'Rental order loaded' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Rentals'],
        security: [{ bearerAuth: [] }],
        summary: 'Edit a pending rental order',
        description: 'Requires expectedVersion and is allowed only while PENDING_CONFIRMATION.',
        responses: {
          '200': { description: 'Rental order updated' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/rentals/orders/{orderId}/confirm': {
      post: {
        tags: ['Rentals'],
        security: [{ bearerAuth: [] }],
        summary: 'Confirm order and allocate units',
        responses: {
          '200': { description: 'Rental order confirmed' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/rentals/orders/{orderId}/pickup': {
      post: {
        tags: ['Rentals'],
        security: [{ bearerAuth: [] }],
        summary: 'Record pickup condition and evidence',
        responses: {
          '200': { description: 'Rental order picked up' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/rentals/orders/{orderId}/return': {
      post: {
        tags: ['Rentals'],
        security: [{ bearerAuth: [] }],
        summary: 'Inspect returned items and evidence',
        responses: {
          '200': { description: 'Rental order returned' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/rentals/orders/{orderId}/complete': {
      post: {
        tags: ['Rentals'],
        security: [{ bearerAuth: [] }],
        summary: 'Complete settlement',
        responses: {
          '200': { description: 'Rental order completed' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/payments/orders/{orderId}/summary': {
      get: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Get rental payment and refund settlement summary',
        parameters: [
          {
            name: 'orderId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { '200': { description: 'Settlement loaded' } },
      },
    },
    '/payments/orders/{orderId}': {
      get: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'List payments for a rental order',
        responses: { '200': { description: 'Payments loaded' } },
      },
    },
    '/payments/orders/{orderId}/cash': {
      post: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Record a successful cash payment (staff only)',
        responses: {
          '201': { description: 'Cash payment recorded' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/payments/orders/{orderId}/checkout': {
      post: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Create a pending payOS checkout and return its QR code',
        responses: {
          '201': { description: 'Checkout created' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/payments/orders/{orderId}/settlement': {
      post: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Prepare return settlement before collecting extra fees or refunding deposit',
        responses: {
          '200': { description: 'Settlement prepared' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/webhooks/payments/payos': {
      post: {
        tags: ['Payments'],
        summary: 'Receive and verify a payOS payment notification',
        responses: {
          '200': { description: 'Webhook acknowledged' },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/payments/{paymentId}/refunds': {
      post: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Request a deposit refund from a successful payment',
        responses: {
          '201': { description: 'Refund requested' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/payments/{paymentId}': {
      get: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Get payment detail and refunds',
        responses: { '200': { description: 'Payment loaded' } },
      },
    },
    '/payments/{paymentId}/cancel': {
      post: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Cancel a pending payOS checkout',
        responses: {
          '200': { description: 'Payment cancelled' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/payments/orders/{orderId}/refunds': {
      get: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'List refunds for a rental order',
        responses: { '200': { description: 'Refunds loaded' } },
      },
    },
    '/payments/refunds/{refundId}/complete': {
      post: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Record a completed manual refund',
        responses: {
          '200': { description: 'Refund completed' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/payments/refunds/{refundId}/fail': {
      post: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Mark a requested refund as failed',
        responses: {
          '200': { description: 'Refund failed' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/inventory/units': {
      get: {
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        summary: 'List physical costume units',
        description:
          'Requires inventory.read.BRANCH for assigned branches or inventory.read.ALL. Retired units remain visible.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          {
            name: 'search',
            in: 'query',
            schema: { type: 'string', maxLength: 100 },
            description: 'Matches unitCode',
          },
          { name: 'branchId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'variantId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          {
            name: 'operationalStatus',
            in: 'query',
            schema: { $ref: '#/components/schemas/UnitOperationalStatus' },
          },
          {
            name: 'conditionGrade',
            in: 'query',
            schema: { $ref: '#/components/schemas/CostumeConditionGrade' },
          },
          {
            name: 'sortBy',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['unitCode', 'operationalStatus', 'conditionGrade', 'createdAt', 'updatedAt'],
              default: 'createdAt',
            },
          },
          {
            name: 'sortOrder',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        ],
        responses: {
          '200': { description: 'Units loaded' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        summary: 'Register a physical costume unit',
        description:
          'Requires inventory.manage for the target branch. Locks the active branch and active variant/model/category hierarchy; unitCode is normalized to uppercase and the unit starts INBOUND + UNINSPECTED.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateCostumeUnitInput' } },
          },
        },
        responses: {
          '201': { description: 'Unit created' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': {
            description: 'UNIT_CODE_CONFLICT',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/inventory/units/{unitId}': {
      get: {
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        summary: 'Get costume unit detail',
        parameters: [{ $ref: '#/components/parameters/unitId' }],
        responses: {
          '200': { description: 'Unit loaded' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        summary: 'Correct unit acquisition metadata or notes',
        description:
          'Requires inventory.manage for the unit branch. Branch, variant, code, condition and lifecycle status cannot be changed here.',
        parameters: [{ $ref: '#/components/parameters/unitId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateCostumeUnitInput' } },
          },
        },
        responses: {
          '200': { description: 'Unit updated' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/inventory/units/{unitId}/inspect': {
      post: {
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        summary: 'Inspect an inbound unit',
        description:
          'Requires inventory.manage. Only INBOUND units can be inspected; this atomically records condition and moves the unit to READY or REPAIR.',
        parameters: [{ $ref: '#/components/parameters/unitId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InspectCostumeUnitInput' },
            },
          },
        },
        responses: {
          '200': { description: 'Unit inspected' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'INVALID_UNIT_TRANSITION' },
        },
      },
    },
    '/inventory/units/{unitId}/status': {
      post: {
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        summary: 'Change a unit operational status',
        description:
          'Requires inventory.manage. Allowed transitions: READY→CLEANING/REPAIR, CLEANING→READY/REPAIR, REPAIR→READY. Transfer and retirement have dedicated flows.',
        parameters: [{ $ref: '#/components/parameters/unitId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ChangeCostumeUnitStatusInput' },
            },
          },
        },
        responses: {
          '200': { description: 'Unit status updated' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'INVALID_UNIT_TRANSITION' },
        },
      },
    },
    '/inventory/units/{unitId}/retire': {
      post: {
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        summary: 'Permanently retire a unit',
        description:
          'Requires inventory.manage. Prohibited while the unit has an active order, transfer or block; retirement is terminal.',
        parameters: [{ $ref: '#/components/parameters/unitId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RetireCostumeUnitInput' } },
          },
        },
        responses: {
          '200': { description: 'Unit retired' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'UNIT_IN_USE or INVALID_UNIT_TRANSITION' },
        },
      },
    },
    '/inventory/units/{unitId}/events': {
      get: {
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        summary: 'List costume unit lifecycle events',
        description:
          'Requires inventory.read for the unit branch. Events are immutable history and remain available after retirement.',
        parameters: [
          { $ref: '#/components/parameters/unitId' },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          '200': { description: 'Unit events loaded' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/inventory/transfers': {
      get: {
        tags: ['Transfers'],
        security: [{ bearerAuth: [] }],
        summary: 'List stock transfers',
        description:
          'Requires transfers.read for either transfer branch, or transfers.read.ALL. Supports page, pageSize, search, branchId, fromBranchId, toBranchId, status, sortBy and sortOrder.',
        responses: {
          '200': { description: 'Transfers loaded' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Transfers'],
        security: [{ bearerAuth: [] }],
        summary: 'Request a stock transfer',
        description:
          'Requires transfers.manage for the source branch. Locks both active branches and the requested units; a unit is reserved from REQUESTED onward.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateTransferInput' } },
          },
        },
        responses: {
          '201': {
            description: 'Transfer requested',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/StockTransfer' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': { description: 'UNIT_UNAVAILABLE or TRANSFER_CODE_CONFLICT' },
        },
      },
    },
    '/inventory/transfers/{transferId}': {
      get: {
        tags: ['Transfers'],
        security: [{ bearerAuth: [] }],
        summary: 'Get transfer detail',
        parameters: [{ $ref: '#/components/parameters/transferId' }],
        responses: {
          '200': {
            description: 'Transfer loaded',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/StockTransfer' } },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Transfers'],
        security: [{ bearerAuth: [] }],
        summary: 'Amend a requested transfer',
        description:
          'Source branch only. The expectedVersion prevents lost updates; only REQUESTED transfers can be changed.',
        parameters: [{ $ref: '#/components/parameters/transferId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateTransferInput' } },
          },
        },
        responses: {
          '200': {
            description: 'Transfer updated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/StockTransfer' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': {
            description:
              'TRANSFER_VERSION_CONFLICT, UNIT_UNAVAILABLE, or INVALID_TRANSFER_TRANSITION',
          },
        },
      },
    },
    '/inventory/transfers/{transferId}/approve': {
      post: {
        tags: ['Transfers'],
        security: [{ bearerAuth: [] }],
        summary: 'Approve a requested transfer',
        description: 'Destination branch only; REQUESTED to APPROVED.',
        parameters: [{ $ref: '#/components/parameters/transferId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/TransferVersionInput' } },
          },
        },
        responses: {
          '200': { description: 'Transfer approved' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'TRANSFER_VERSION_CONFLICT or INVALID_TRANSFER_TRANSITION' },
        },
      },
    },
    '/inventory/transfers/{transferId}/reject': {
      post: {
        tags: ['Transfers'],
        security: [{ bearerAuth: [] }],
        summary: 'Reject a requested transfer',
        description: 'Destination branch only; REQUESTED to REJECTED.',
        parameters: [{ $ref: '#/components/parameters/transferId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/TransferEndInput' } },
          },
        },
        responses: {
          '200': { description: 'Transfer rejected' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'TRANSFER_VERSION_CONFLICT or INVALID_TRANSFER_TRANSITION' },
        },
      },
    },
    '/inventory/transfers/{transferId}/cancel': {
      post: {
        tags: ['Transfers'],
        security: [{ bearerAuth: [] }],
        summary: 'Cancel a requested or approved transfer',
        description: 'Source branch only. Cannot cancel once shipped.',
        parameters: [{ $ref: '#/components/parameters/transferId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/TransferEndInput' } },
          },
        },
        responses: {
          '200': { description: 'Transfer cancelled' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'TRANSFER_VERSION_CONFLICT or INVALID_TRANSFER_TRANSITION' },
        },
      },
    },
    '/inventory/transfers/{transferId}/ship': {
      post: {
        tags: ['Transfers'],
        security: [{ bearerAuth: [] }],
        summary: 'Ship every unit in an approved transfer',
        description:
          'Source branch only. All items must be supplied exactly once; units become IN_TRANSFER and immutable shipment events are created.',
        parameters: [{ $ref: '#/components/parameters/transferId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ShipTransferInput' } },
          },
        },
        responses: {
          '200': { description: 'Transfer shipped' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': {
            description:
              'UNIT_UNAVAILABLE, TRANSFER_VERSION_CONFLICT, or INVALID_TRANSFER_TRANSITION',
          },
        },
      },
    },
    '/inventory/transfers/{transferId}/receive': {
      post: {
        tags: ['Transfers'],
        security: [{ bearerAuth: [] }],
        summary: 'Receive every shipped unit',
        description:
          'Destination branch only. Full receipt moves each unit to the destination and records its incoming condition. DAMAGED must be received into REPAIR.',
        parameters: [{ $ref: '#/components/parameters/transferId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ReceiveTransferInput' } },
          },
        },
        responses: {
          '200': { description: 'Transfer received' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': {
            description:
              'UNIT_UNAVAILABLE, TRANSFER_VERSION_CONFLICT, or INVALID_TRANSFER_TRANSITION',
          },
        },
      },
    },
    '/branches': {
      get: {
        tags: ['Branches'],
        security: [{ bearerAuth: [] }],
        summary: 'List branches',
        description:
          'Requires branches.read.ALL. Branch administration is global; branch-scoped assignments cannot list branches.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/BranchStatus' } },
          {
            name: 'sortBy',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['branchCode', 'name', 'status', 'createdAt', 'updatedAt'],
              default: 'createdAt',
            },
          },
          {
            name: 'sortOrder',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        ],
        responses: {
          '200': { description: 'Branches loaded' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Branches'],
        security: [{ bearerAuth: [] }],
        summary: 'Create a branch',
        description: 'Requires branches.manage.ALL. branchCode is normalized to uppercase.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateBranchInput' } },
          },
        },
        responses: {
          '201': { description: 'Branch created' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': {
            description: 'BRANCH_CODE_CONFLICT',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/branches/{branchId}': {
      get: {
        tags: ['Branches'],
        security: [{ bearerAuth: [] }],
        summary: 'Get a branch',
        description: 'Requires branches.read.ALL.',
        parameters: [{ $ref: '#/components/parameters/branchId' }],
        responses: {
          '200': { description: 'Branch loaded' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Branches'],
        security: [{ bearerAuth: [] }],
        summary: 'Update a branch',
        description: 'Requires branches.manage.ALL. branchCode and status cannot be changed here.',
        parameters: [{ $ref: '#/components/parameters/branchId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateBranchInput' } },
          },
        },
        responses: {
          '200': { description: 'Branch updated' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Branches'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete an unused branch',
        description:
          'Requires branches.manage.ALL. Returns BRANCH_IN_USE when any historical or operational relation exists; no relation is cascaded.',
        parameters: [{ $ref: '#/components/parameters/branchId' }],
        responses: {
          '204': { description: 'Branch deleted' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': {
            description: 'BRANCH_IN_USE',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/branches/{branchId}/activate': {
      post: {
        tags: ['Branches'],
        security: [{ bearerAuth: [] }],
        summary: 'Activate a branch',
        description: 'Requires branches.manage.ALL.',
        parameters: [{ $ref: '#/components/parameters/branchId' }],
        responses: {
          '200': { description: 'Branch activated' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/branches/{branchId}/deactivate': {
      post: {
        tags: ['Branches'],
        security: [{ bearerAuth: [] }],
        summary: 'Deactivate a branch',
        description:
          'Requires branches.manage.ALL. Blocked by open orders/transfers/CRM cases, non-retired units, or branch role assignments.',
        parameters: [{ $ref: '#/components/parameters/branchId' }],
        responses: {
          '200': { description: 'Branch deactivated' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': {
            description: 'BRANCH_IN_USE',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
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
      delete: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete an unused category',
        description: 'Returns 409 when the category still has child categories or models.',
        parameters: [{ $ref: '#/components/parameters/id' }],
        responses: {
          '204': { description: 'Category deleted' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
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
      delete: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete an unused model',
        description: 'Returns 409 when the model still has variants, accessories, or media.',
        parameters: [{ $ref: '#/components/parameters/id' }],
        responses: {
          '204': { description: 'Model deleted' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
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
      delete: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete an unused variant',
        description: 'Returns 409 when the variant has units, order items, or media.',
        parameters: [{ $ref: '#/components/parameters/id' }],
        responses: {
          '204': { description: 'Variant deleted' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
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
      delete: {
        tags: ['Catalog'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete an unused accessory',
        description: 'Returns 409 when the accessory appears in rental history.',
        parameters: [{ $ref: '#/components/parameters/id' }],
        responses: {
          '204': { description: 'Accessory deleted' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
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
