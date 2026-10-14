import { relations } from "drizzle-orm";

import { account, session, user } from "./auth";
import { citizen, driverLicense, vehicle, vehicleDocument } from "./citizens";
import { branch, entity, entityBankAccount, staffMember } from "./entities";
import { notification } from "./notifications";
import {
  fine,
  infraction,
  obligation,
  procedure,
  procedureType,
} from "./obligations";
import { installment, payment, paymentAgreement, payout } from "./payments";
import { appointment, courseEnrollment, courseSession } from "./scheduling";

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session, { relationName: "session_user" }),
  impersonatedSessions: many(session, {
    relationName: "session_impersonated_by",
  }),
  accounts: many(account),
  staffMemberships: many(staffMember),
  citizen: one(citizen),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
    relationName: "session_user",
  }),
  impersonator: one(user, {
    fields: [session.impersonatedBy],
    references: [user.id],
    relationName: "session_impersonated_by",
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const entityRelations = relations(entity, ({ many }) => ({
  branches: many(branch),
  bankAccounts: many(entityBankAccount),
  staffMembers: many(staffMember),
  procedureTypes: many(procedureType),
  obligations: many(obligation),
  courseSessions: many(courseSession),
  payouts: many(payout),
  issuedVehicleDocuments: many(vehicleDocument),
}));

export const branchRelations = relations(branch, ({ many, one }) => ({
  entity: one(entity, { fields: [branch.entityId], references: [entity.id] }),
  appointments: many(appointment),
  courseSessions: many(courseSession),
}));

export const entityBankAccountRelations = relations(
  entityBankAccount,
  ({ many, one }) => ({
    entity: one(entity, {
      fields: [entityBankAccount.entityId],
      references: [entity.id],
    }),
    payouts: many(payout),
  })
);

export const staffMemberRelations = relations(staffMember, ({ one }) => ({
  user: one(user, { fields: [staffMember.userId], references: [user.id] }),
  entity: one(entity, {
    fields: [staffMember.entityId],
    references: [entity.id],
  }),
}));

export const citizenRelations = relations(citizen, ({ many, one }) => ({
  user: one(user, { fields: [citizen.userId], references: [user.id] }),
  driverLicenses: many(driverLicense),
  vehicles: many(vehicle),
  obligations: many(obligation),
  appointments: many(appointment),
  courseEnrollments: many(courseEnrollment),
  payments: many(payment),
  notifications: many(notification),
}));

export const driverLicenseRelations = relations(driverLicense, ({ one }) => ({
  citizen: one(citizen, {
    fields: [driverLicense.citizenId],
    references: [citizen.id],
  }),
}));

export const vehicleRelations = relations(vehicle, ({ many, one }) => ({
  owner: one(citizen, { fields: [vehicle.ownerId], references: [citizen.id] }),
  documents: many(vehicleDocument),
  fines: many(fine),
  procedures: many(procedure),
}));

export const vehicleDocumentRelations = relations(
  vehicleDocument,
  ({ one }) => ({
    vehicle: one(vehicle, {
      fields: [vehicleDocument.vehicleId],
      references: [vehicle.id],
    }),
    issuerEntity: one(entity, {
      fields: [vehicleDocument.issuerEntityId],
      references: [entity.id],
    }),
  })
);

export const infractionRelations = relations(infraction, ({ many }) => ({
  fines: many(fine),
}));

export const procedureTypeRelations = relations(
  procedureType,
  ({ many, one }) => ({
    entity: one(entity, {
      fields: [procedureType.entityId],
      references: [entity.id],
    }),
    procedures: many(procedure),
    appointments: many(appointment),
  })
);

export const obligationRelations = relations(obligation, ({ many, one }) => ({
  citizen: one(citizen, {
    fields: [obligation.citizenId],
    references: [citizen.id],
  }),
  entity: one(entity, {
    fields: [obligation.entityId],
    references: [entity.id],
  }),
  fine: one(fine),
  procedure: one(procedure),
  appointments: many(appointment),
  courseEnrollments: many(courseEnrollment),
  paymentAgreements: many(paymentAgreement),
  payments: many(payment),
  notifications: many(notification),
}));

export const fineRelations = relations(fine, ({ one }) => ({
  obligation: one(obligation, {
    fields: [fine.obligationId],
    references: [obligation.id],
  }),
  infraction: one(infraction, {
    fields: [fine.infractionId],
    references: [infraction.id],
  }),
  vehicle: one(vehicle, { fields: [fine.vehicleId], references: [vehicle.id] }),
}));

export const procedureRelations = relations(procedure, ({ one }) => ({
  obligation: one(obligation, {
    fields: [procedure.obligationId],
    references: [obligation.id],
  }),
  procedureType: one(procedureType, {
    fields: [procedure.procedureTypeId],
    references: [procedureType.id],
  }),
  vehicle: one(vehicle, {
    fields: [procedure.vehicleId],
    references: [vehicle.id],
  }),
}));

export const appointmentRelations = relations(appointment, ({ one }) => ({
  citizen: one(citizen, {
    fields: [appointment.citizenId],
    references: [citizen.id],
  }),
  branch: one(branch, {
    fields: [appointment.branchId],
    references: [branch.id],
  }),
  procedureType: one(procedureType, {
    fields: [appointment.procedureTypeId],
    references: [procedureType.id],
  }),
  obligation: one(obligation, {
    fields: [appointment.obligationId],
    references: [obligation.id],
  }),
}));

export const courseSessionRelations = relations(
  courseSession,
  ({ many, one }) => ({
    entity: one(entity, {
      fields: [courseSession.entityId],
      references: [entity.id],
    }),
    branch: one(branch, {
      fields: [courseSession.branchId],
      references: [branch.id],
    }),
    enrollments: many(courseEnrollment),
  })
);

export const courseEnrollmentRelations = relations(
  courseEnrollment,
  ({ one }) => ({
    courseSession: one(courseSession, {
      fields: [courseEnrollment.courseSessionId],
      references: [courseSession.id],
    }),
    citizen: one(citizen, {
      fields: [courseEnrollment.citizenId],
      references: [citizen.id],
    }),
    obligation: one(obligation, {
      fields: [courseEnrollment.obligationId],
      references: [obligation.id],
    }),
  })
);

export const paymentAgreementRelations = relations(
  paymentAgreement,
  ({ many, one }) => ({
    obligation: one(obligation, {
      fields: [paymentAgreement.obligationId],
      references: [obligation.id],
    }),
    installments: many(installment),
  })
);

export const installmentRelations = relations(installment, ({ many, one }) => ({
  paymentAgreement: one(paymentAgreement, {
    fields: [installment.paymentAgreementId],
    references: [paymentAgreement.id],
  }),
  payments: many(payment),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
  citizen: one(citizen, {
    fields: [payment.citizenId],
    references: [citizen.id],
  }),
  obligation: one(obligation, {
    fields: [payment.obligationId],
    references: [obligation.id],
  }),
  installment: one(installment, {
    fields: [payment.installmentId],
    references: [installment.id],
  }),
}));

export const payoutRelations = relations(payout, ({ one }) => ({
  entity: one(entity, { fields: [payout.entityId], references: [entity.id] }),
  entityBankAccount: one(entityBankAccount, {
    fields: [payout.entityBankAccountId],
    references: [entityBankAccount.id],
  }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  citizen: one(citizen, {
    fields: [notification.citizenId],
    references: [citizen.id],
  }),
  obligation: one(obligation, {
    fields: [notification.obligationId],
    references: [obligation.id],
  }),
}));
