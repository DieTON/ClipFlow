const swaggerDocs = {
  openapi: '3.0.0',
  info: {
    title: 'ClipFlow API',
    version: '1.0.0',
    description:
      'AI-powered video clip generator and YouTube Shorts auto-publisher',
    contact: {
      name: 'ClipFlow Support',
    },
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Development Server',
    },
    {
      url: process.env.API_URL || 'https://api.clipflow.app',
      description: 'Production Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

export default swaggerDocs;
