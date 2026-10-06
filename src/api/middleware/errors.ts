import type { FastifyError, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { ZodError } from 'zod'

const errorPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler(
    (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.flatten().fieldErrors,
          },
        })
      }

      if (error.validation) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            details: error.validation,
          },
        })
      }

      if (error.statusCode === 429) {
        return reply.code(429).send({
          success: false,
          error: { code: 'RATE_LIMIT', message: 'Too many requests' },
        })
      }

      const status = error.statusCode ?? 500
      const isDev = process.env.NODE_ENV !== 'production'

      return reply.code(status).send({
        success: false,
        error: {
          code: error.code ?? 'INTERNAL_ERROR',
          message: isDev ? error.message : 'Internal server error',
          ...(isDev && { stack: error.stack }),
        },
      })
    }
  )

  fastify.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  })
}

export default fp(errorPlugin, { name: 'errors' })
