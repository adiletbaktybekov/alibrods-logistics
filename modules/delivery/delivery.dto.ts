import { z } from 'zod';
import { AssignmentStatus } from '@prisma/client';

export const updateAssignmentStatusSchema = z.object({
  status: z.nativeEnum(AssignmentStatus),
  notes: z.string().optional(),
});

export type UpdateAssignmentStatusDto = z.infer<typeof updateAssignmentStatusSchema>;
