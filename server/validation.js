const { z } = require('zod');

const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (e) {
    return res.status(400).send(e.errors);
  }
};

const idParamSchema = z.object({
  params: z.object({
    id: z.string().cuid({ message: "Invalid ID format" }),
  }),
});

const personalIdParamSchema = z.object({
  params: z.object({
    personalId: z.string().regex(/^\d{9}$/, { message: "Personal ID must be a 9-digit string" }),
  }),
});

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
});

const checkInSchema = z.object({
  body: z.object({
    personalId: z.string().regex(/^\d{9}$/),
  }),
});

const voteSchema = z.object({
  body: z.object({
    personalId: z.string().regex(/^\d{9}$/),
    selections: z.record(z.array(z.string().cuid())),
  }),
});

const voterSchema = z.object({
  body: z.object({
    personalId: z.string().regex(/^\d{9}$/),
    name: z.string().min(1),
    membershipType: z.enum(['FULL', 'INCOMPLETE']),
  }),
});

const candidateSchema = z.object({
  body: z.object({
    personalId: z.string().regex(/^\d{9}$/),
    formNumber: z.string().min(1),
    name: z.string().min(1),
    positionId: z.string().cuid(),
    qualifications: z.string().optional(),
    jobTitle: z.string().optional(),
    workplace: z.string().optional(),
    pictureUrl: z.string().url().or(z.literal('')).optional(),
  }),
});

const positionSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    maxSelections: z.number().int().positive(),
  }),
});

const orgSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    electionTitle: z.string().optional(),
    electionDate: z.string().datetime().optional(),
    logoUrl: z.string().url().or(z.literal('')).optional(),
  }),
});

const stationUserSchema = z.object({
  body: z.object({
    username: z.string().min(1),
    password: z.string().min(4),
    station: z.enum(['CHECK_IN', 'KIOSK']),
  }),
});

const reportParamsSchema = z.object({
  params: z.object({
    id: z.string().regex(/^r\d{1,2}$/), // e.g., r1, r10
  }),
});

module.exports = {
  validate,
  idParamSchema,
  personalIdParamSchema,
  loginSchema,
  checkInSchema,
  voteSchema,
  voterSchema,
  candidateSchema,
  positionSchema,
  orgSchema,
  stationUserSchema,
  reportParamsSchema,
};
