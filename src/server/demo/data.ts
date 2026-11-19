/**
 * Demo data for Barrancabermeja, Santander (Colombia). All people, numbers, and plates are fictitious.
 * A seeded random generator makes the same data on each run. Only the dates move with `now`.
 * Node runs this file without a build step, so it imports nothing from the app.
 */

export const DEMO_EMAIL_DOMAIN = "transipay.test";

export type DemoPlatformRole = "admin" | "supervisor" | "cashier" | "scheduler";
type DemoEntityRole = "supervisor" | "cashier" | "scheduler";
type DemoDocumentType = "CC" | "CE" | "PP" | "TI";

const ITTB = "8290001234";
const CDA = "9012345671";
const CEA = "9007654328";
const COLLECTOR = "9001112223";

export const DEMO_ENTITIES = [
  {
    taxId: ITTB,
    kind: "transit_authority",
    name: "Instituto de Tránsito y Transporte de Barrancabermeja",
    email: `ittb@${DEMO_EMAIL_DOMAIN}`,
    phone: "6076214500",
  },
  {
    taxId: CDA,
    kind: "cda",
    name: "CDA Puerto Petróleo",
    email: `cda@${DEMO_EMAIL_DOMAIN}`,
    phone: "6076223310",
  },
  {
    taxId: CEA,
    kind: "cea",
    name: "CEA Conduzca Seguro Barranca",
    email: `cea@${DEMO_EMAIL_DOMAIN}`,
    phone: "6076209877",
  },
  {
    taxId: COLLECTOR,
    kind: "collector",
    name: "Recaudos del Magdalena Medio",
    email: `recaudos@${DEMO_EMAIL_DOMAIN}`,
    phone: "6076117020",
  },
] as const;

export const DEMO_BRANCHES = [
  {
    entityTaxId: ITTB,
    name: "Sede principal",
    address: "Calle 49 # 9-20, Centro",
  },
  {
    entityTaxId: ITTB,
    name: "Punto de atención El Parnaso",
    address: "Carrera 28 # 47-15, barrio El Parnaso",
  },
  {
    entityTaxId: CDA,
    name: "Sede vía al Llanito",
    address: "Vía al Llanito km 1, sector Las Granjas",
  },
  {
    entityTaxId: CEA,
    name: "Sede barrio Colombia",
    address: "Calle 52 # 23-41, barrio Colombia",
  },
  {
    entityTaxId: COLLECTOR,
    name: "Oficina Centro",
    address: "Carrera 11 # 50-38, Centro",
  },
] as const;

/** Codes of the Colombian traffic code (Ley 769 de 2002, Ley 1383 de 2010). Amounts are near 2026 values, not official. */
export const DEMO_INFRACTIONS = [
  {
    code: "B01",
    description:
      "Conducir un vehículo sin llevar consigo la licencia de conducción.",
    amountInCents: 33_830_000,
  },
  {
    code: "C02",
    description: "Estacionar un vehículo en sitios prohibidos.",
    amountInCents: 63_430_000,
  },
  {
    code: "C03",
    description: "Bloquear una calzada o intersección con un vehículo.",
    amountInCents: 63_430_000,
  },
  {
    code: "C14",
    description:
      "Transitar por sitios restringidos o en horas prohibidas por la autoridad competente.",
    amountInCents: 63_430_000,
  },
  {
    code: "C24",
    description:
      "Conducir motocicleta sin observar las normas establecidas en el código de tránsito.",
    amountInCents: 63_430_000,
  },
  {
    code: "C29",
    description:
      "Conducir un vehículo a velocidad superior a la máxima permitida.",
    amountInCents: 63_430_000,
  },
  {
    code: "C35",
    description:
      "No realizar la revisión técnico-mecánica en el plazo legal establecido.",
    amountInCents: 63_430_000,
  },
  {
    code: "C38",
    description:
      "Usar sistemas móviles de comunicación o teléfonos mientras conduce.",
    amountInCents: 63_430_000,
  },
  {
    code: "D02",
    description: "Conducir sin portar los seguros ordenados por la ley (SOAT).",
    amountInCents: 126_860_000,
  },
  {
    code: "D04",
    description:
      "No detenerse ante una luz roja o amarilla de semáforo o una señal de PARE.",
    amountInCents: 126_860_000,
  },
] as const;

export const DEMO_PROCEDURE_TYPES = [
  {
    entityTaxId: ITTB,
    code: "ITTB-LIC-EXP",
    name: "Expedición de licencia de conducción",
    amountInCents: 25_470_000,
    requiresAppointment: true,
  },
  {
    entityTaxId: ITTB,
    code: "ITTB-LIC-REN",
    name: "Renovación de licencia de conducción",
    amountInCents: 18_640_000,
    requiresAppointment: true,
  },
  {
    entityTaxId: ITTB,
    code: "ITTB-TRASPASO",
    name: "Traspaso de propiedad de vehículo",
    amountInCents: 31_260_000,
    requiresAppointment: true,
  },
  {
    entityTaxId: ITTB,
    code: "ITTB-CERT-TRAD",
    name: "Certificado de tradición del vehículo",
    amountInCents: 4_890_000,
    requiresAppointment: false,
  },
  {
    entityTaxId: ITTB,
    code: "ITTB-PAZ-SALVO",
    name: "Paz y salvo de comparendos",
    amountInCents: 0,
    requiresAppointment: false,
  },
  {
    entityTaxId: CDA,
    code: "CDA-RTM-AUTO",
    name: "Revisión técnico-mecánica y de emisiones (automóvil)",
    amountInCents: 31_500_000,
    requiresAppointment: true,
  },
  {
    entityTaxId: CDA,
    code: "CDA-RTM-MOTO",
    name: "Revisión técnico-mecánica y de emisiones (motocicleta)",
    amountInCents: 21_200_000,
    requiresAppointment: true,
  },
  {
    entityTaxId: CEA,
    code: "CEA-CURSO-B1",
    name: "Curso de conducción categoría B1",
    amountInCents: 135_000_000,
    requiresAppointment: true,
  },
  {
    entityTaxId: CEA,
    code: "CEA-CURSO-A2",
    name: "Curso de conducción categoría A2",
    amountInCents: 89_000_000,
    requiresAppointment: true,
  },
] as const;

export interface DemoStaff {
  role: DemoPlatformRole;
  name: string;
  email: string;
  memberships: { entityTaxId: string; role: DemoEntityRole }[];
}

/**
 * The shared password of all demo accounts. It is public on purpose: this data is only for the public demo.
 * The app needs 12 characters or more.
 */
// oxlint-disable-next-line no-inline-comments -- GitGuardian reads "ggignore" only on the line of the value.
export const DEMO_PASSWORD = "TransipayDemo2026"; // ggignore: public demo password, not a secret

/** One account for each staff role. The admin works with all entities, so it has no membership. */
export const DEMO_STAFF: DemoStaff[] = [
  {
    role: "admin",
    name: "Laura Rincón Vargas",
    email: `admin@${DEMO_EMAIL_DOMAIN}`,
    memberships: [],
  },
  {
    role: "supervisor",
    name: "Andrés Felipe Quintero",
    email: `supervisor@${DEMO_EMAIL_DOMAIN}`,
    memberships: [
      { entityTaxId: ITTB, role: "supervisor" },
      { entityTaxId: CDA, role: "supervisor" },
    ],
  },
  {
    role: "cashier",
    name: "Diana Marcela Ortiz",
    email: `cajero@${DEMO_EMAIL_DOMAIN}`,
    memberships: [
      { entityTaxId: ITTB, role: "cashier" },
      { entityTaxId: CDA, role: "cashier" },
    ],
  },
  {
    role: "scheduler",
    name: "Jorge Iván Mantilla",
    email: `agendador@${DEMO_EMAIL_DOMAIN}`,
    memberships: [
      { entityTaxId: ITTB, role: "scheduler" },
      { entityTaxId: CDA, role: "scheduler" },
      { entityTaxId: CEA, role: "scheduler" },
    ],
  },
];

/** Park-Miller generator (MINSTD): a small seeded generator. The same seed gives the same numbers. */
const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;

const createRandom = (seed: number) => {
  let state = seed % MODULUS;
  // The products stay below 2^53, so the arithmetic is exact.
  const next = () => {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)];
    if (item === undefined) {
      throw new Error("pick needs a list with items.");
    }
    return item;
  };
  const digits = (count: number) =>
    Array.from({ length: count }, () => String(int(0, 9))).join("");
  return { next, int, pick, digits };
};

type Random = ReturnType<typeof createRandom>;

const PEOPLE: [given: string, surnames: string, type: DemoDocumentType][] = [
  ["María Fernanda", "Gómez Ardila", "CC"],
  ["Carlos Andrés", "Pérez Rueda", "CC"],
  ["Luz Marina", "Díaz Castellanos", "CC"],
  ["José Luis", "Martínez Suárez", "CC"],
  ["Ana Milena", "Rodríguez Jaimes", "CC"],
  ["Juan David", "Herrera Pinzón", "CC"],
  ["Claudia Patricia", "Sánchez Mejía", "CC"],
  ["Luis Eduardo", "Ramírez Parra", "CC"],
  ["Sandra Liliana", "Torres Villamizar", "CC"],
  ["Óscar Javier", "Rojas Durán", "CC"],
  ["Paola Andrea", "Moreno Cáceres", "CC"],
  ["Edwin Alberto", "Castro Serrano", "CC"],
  ["Yuliana", "Vargas Ortega", "CC"],
  ["Fabián Ricardo", "Mendoza Lizarazo", "CC"],
  ["Natalia", "Jiménez Barrera", "CC"],
  ["Wilson Arley", "Cárdenas Plata", "CC"],
  ["Diana Carolina", "Gutiérrez Arenas", "CC"],
  ["Hernán Darío", "Acevedo Galvis", "CC"],
  ["Marisol", "Pabón Camacho", "CC"],
  ["Jhon Fredy", "Ríos Bautista", "CC"],
  ["Leidy Johana", "Contreras Niño", "CC"],
  ["Ricardo", "Ardila Solano", "CC"],
  ["Mónica Alejandra", "Peña Toloza", "CC"],
  ["Germán Augusto", "Delgado Prada", "CC"],
  ["Erika Tatiana", "Navarro Quiroga", "CC"],
  ["Rafael Antonio", "Hernández Lozano", "CC"],
  ["Gloria Inés", "Becerra Amaya", "CC"],
  ["Yorman José", "Linares Colmenares", "CE"],
  ["Daniela Alejandra", "Urdaneta Rivas", "CE"],
  ["Miguel Ángel", "Briceño Montilla", "PP"],
  ["Valentina Sofía", "Paredes Chacón", "PP"],
  ["Santiago", "Arenas Gómez", "TI"],
];

const NEIGHBORHOODS = [
  "Colombia",
  "El Parnaso",
  "Buenos Aires",
  "La Floresta",
  "Galán",
  "Torcoroma",
  "El Cerro",
  "Primero de Mayo",
  "Pueblo Nuevo",
  "Las Granjas",
  "El Rosario",
  "Boston",
  "Miraflores",
  "Palmira",
] as const;

const MOBILE_PREFIXES = [
  "300",
  "301",
  "302",
  "304",
  "310",
  "311",
  "312",
  "313",
  "314",
  "315",
  "316",
  "317",
  "318",
  "320",
  "321",
  "350",
] as const;

const CARS = [
  ["Chevrolet", "Spark GT"],
  ["Renault", "Logan"],
  ["Mazda", "2 Sedán"],
  ["Kia", "Picanto"],
  ["Toyota", "Hilux"],
  ["Nissan", "Frontier"],
  ["Renault", "Duster"],
] as const;

const MOTORCYCLES = [
  ["Yamaha", "NMAX 155"],
  ["Honda", "CB 125F"],
  ["AKT", "NKD 125"],
  ["Bajaj", "Boxer CT100"],
  ["Suzuki", "GN 125"],
  ["TVS", "Apache RTR 160"],
] as const;

const LOCATIONS = [
  "Avenida del Ferrocarril con Calle 52",
  "Carrera 28 con Calle 47, sector El Parnaso",
  "Vía Parnaso - El Llanito, km 2",
  "Avenida Circunvalar con Calle 60",
  "Calle 49 frente al parque Camilo Torres",
  "Carrera 11 con Calle 50, Comuna 1",
  "Avenida 52 frente al centro comercial San Silvestre",
  "Puente elevado de la Avenida del Ferrocarril",
] as const;

const AGENTS = ["AGT-014", "AGT-027", "AGT-031", "AGT-045", "AGT-058"] as const;

const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ".split("");

/** Lowercase ASCII without accents, for the email address. */
const slug = (value: string) =>
  value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase();

const firstWord = (value: string) => value.split(" ").at(0) ?? value;

const documentNumber = (random: Random, type: DemoDocumentType) => {
  if (type === "CC") {
    return random.next() < 0.75
      ? `1096${random.digits(6)}`
      : `${random.pick(["13", "63", "91"])}${random.digits(6)}`;
  }
  if (type === "CE") {
    return `${random.int(1, 9)}${random.digits(6)}`;
  }
  if (type === "PP") {
    return `${random.int(1, 9)}${random.digits(8)}`;
  }
  return `1096${random.digits(7)}`;
};

const plate = (random: Random, isMotorcycle: boolean) => {
  const letters = Array.from({ length: 3 }, () => random.pick(LETTERS)).join(
    ""
  );
  return isMotorcycle
    ? `${letters}${random.digits(2)}${random.pick(LETTERS)}`
    : `${letters}${random.digits(3)}`;
};

const BOGOTA_OFFSET_HOURS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A time in Bogotá (UTC-5, no daylight saving time), `days` after the Bogotá date of `now`. */
const bogotaTime = (now: Date, days: number, hour: number, minute = 0) => {
  const local = new Date(now.getTime() - BOGOTA_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + days,
      hour + BOGOTA_OFFSET_HOURS,
      minute
    )
  );
};

/** The Bogotá calendar date of the time plus `days`, as YYYY-MM-DD. */
const bogotaDate = (time: Date, days: number) =>
  new Date(
    time.getTime() - BOGOTA_OFFSET_HOURS * 60 * 60 * 1000 + days * DAY_MS
  )
    .toISOString()
    .slice(0, 10);

/** Moves a Saturday or a Sunday to the next Monday. */
const workday = (now: Date, days: number) => {
  const weekday = bogotaTime(now, days, 12).getUTCDay();
  if (weekday === 6) {
    return days + 2;
  }
  return weekday === 0 ? days + 1 : days;
};

export interface DemoCitizen {
  documentType: DemoDocumentType;
  documentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
}

const buildCitizens = (random: Random): DemoCitizen[] => {
  const numbers = new Set<string>();
  return PEOPLE.map(([given, surnames, documentType]) => {
    let number = documentNumber(random, documentType);
    while (numbers.has(number)) {
      number = documentNumber(random, documentType);
    }
    numbers.add(number);
    return {
      documentType,
      documentNumber: number,
      firstName: given,
      lastName: surnames,
      email: `${slug(firstWord(given))}.${slug(firstWord(surnames))}@${DEMO_EMAIL_DOMAIN}`,
      phone: `${random.pick(MOBILE_PREFIXES)}${random.digits(7)}`,
      address: `${random.pick(["Calle", "Carrera", "Transversal", "Diagonal"])} ${random.int(20, 75)} # ${random.int(5, 60)}-${random.int(10, 99)}, barrio ${random.pick(NEIGHBORHOODS)}`,
    };
  });
};

/** The citizens. The same list on each run. */
export const DEMO_CITIZENS = buildCitizens(createRandom(68_081));

/** The first citizen. When this record exists, the domain data exists. */
export const [DEMO_MARKER] = DEMO_CITIZENS;

export interface DemoVehicle {
  ownerDocument: string;
  plate: string;
  vehicleType: "car" | "motorcycle";
  serviceType: "private" | "public";
  brand: string;
  line: string;
  modelYear: number;
}

export interface DemoFine {
  documentNumber: string;
  entityTaxId: string;
  number: string;
  infractionCode: string;
  amountInCents: number;
  status: "pending" | "void";
  issuedAt: Date;
  dueOn: string;
  plate: string | null;
  location: string;
  agentCode: string;
}

export interface DemoProcedure {
  documentNumber: string;
  entityTaxId: string;
  number: string;
  procedureTypeCode: string;
  amountInCents: number;
  status: "pending" | "void";
  issuedAt: Date;
  dueOn: string;
  plate: string | null;
}

export interface DemoAppointment {
  documentNumber: string;
  entityTaxId: string;
  branchName: string;
  procedureTypeCode: string;
  obligationNumber: string | null;
  scheduledAt: Date;
  status: "scheduled" | "attended" | "cancelled" | "no_show";
}

export interface DemoCourseSession {
  entityTaxId: string;
  branchName: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  discountPercent: number;
}

export interface DemoEnrollment {
  documentNumber: string;
  branchName: string;
  startsAt: Date;
  fineEntityTaxId: string;
  fineNumber: string;
  status: "enrolled" | "attended" | "absent";
  attendedAt: Date | null;
}

const branchOf = (entityTaxId: string) => {
  const found = DEMO_BRANCHES.find(
    (branch) => branch.entityTaxId === entityTaxId
  );
  if (found === undefined) {
    throw new Error(`The entity ${entityTaxId} has no demo branch.`);
  }
  return found.name;
};

const infractionOf = (code: string) => {
  const found = DEMO_INFRACTIONS.find((item) => item.code === code);
  if (found === undefined) {
    throw new Error(`The infraction ${code} is not in the demo catalog.`);
  }
  return found;
};

const buildVehicles = (random: Random) => {
  const plates = new Set<string>();
  const vehicles: DemoVehicle[] = [];
  for (const citizen of DEMO_CITIZENS) {
    // A minor (TI) has no vehicle.
    if (citizen.documentType !== "TI" && random.next() < 0.7) {
      const isMotorcycle = random.next() < 0.55;
      let value = plate(random, isMotorcycle);
      while (plates.has(value)) {
        value = plate(random, isMotorcycle);
      }
      plates.add(value);
      const models: readonly (readonly [string, string])[] = isMotorcycle
        ? MOTORCYCLES
        : CARS;
      const [brand, line] = random.pick(models);
      vehicles.push({
        ownerDocument: citizen.documentNumber,
        plate: value,
        vehicleType: isMotorcycle ? "motorcycle" : "car",
        serviceType:
          !isMotorcycle && random.next() < 0.15 ? "public" : "private",
        brand,
        line,
        modelYear: random.int(2010, 2026),
      });
    }
  }
  return vehicles;
};

const buildObligations = (
  random: Random,
  now: Date,
  vehicles: DemoVehicle[]
) => {
  const fines: DemoFine[] = [];
  const procedures: DemoProcedure[] = [];
  let sequence = 1500;
  for (const [index, citizen] of DEMO_CITIZENS.entries()) {
    const vehicle = vehicles.find(
      (item) => item.ownerDocument === citizen.documentNumber
    );
    // The first citizen always has fines, so the demo shows them at once.
    const fineCount =
      index === 0 ? 2 : random.pick([0, 1, 1, 1, 2, 2, 3] as const);
    for (let count = 0; count < fineCount; count += 1) {
      const code =
        vehicle?.vehicleType === "motorcycle" && random.next() < 0.4
          ? "C24"
          : random.pick(DEMO_INFRACTIONS.filter((item) => item.code !== "C24"))
              .code;
      const issuedAt = bogotaTime(
        now,
        -random.int(3, 75),
        random.int(6, 20),
        random.pick([0, 15, 30, 45] as const)
      );
      sequence += random.int(1, 40);
      fines.push({
        documentNumber: citizen.documentNumber,
        entityTaxId: ITTB,
        number: `680810000000${String(sequence).padStart(8, "0")}`,
        infractionCode: code,
        amountInCents: infractionOf(code).amountInCents,
        status: index !== 0 && random.next() < 0.12 ? "void" : "pending",
        issuedAt,
        dueOn: bogotaDate(issuedAt, 30),
        plate: vehicle?.plate ?? null,
        location: random.pick(LOCATIONS),
        agentCode: random.pick(AGENTS),
      });
    }

    if (index % 2 === 0 || random.next() < 0.2) {
      const choices = DEMO_PROCEDURE_TYPES.filter((type) =>
        type.code.startsWith("CDA-RTM")
          ? vehicle !== undefined &&
            type.code.endsWith(
              vehicle.vehicleType === "motorcycle" ? "MOTO" : "AUTO"
            )
          : true
      );
      const type = random.pick(choices);
      const issuedAt = bogotaTime(now, -random.int(1, 60), random.int(8, 16));
      procedures.push({
        documentNumber: citizen.documentNumber,
        entityTaxId: type.entityTaxId,
        number: `TR-2026-${String(procedures.length + 101).padStart(5, "0")}`,
        procedureTypeCode: type.code,
        amountInCents: type.amountInCents,
        status: random.next() < 0.1 ? "void" : "pending",
        issuedAt,
        dueOn: bogotaDate(issuedAt, 45),
        plate: type.code.startsWith("CDA") ? (vehicle?.plate ?? null) : null,
      });
    }
  }
  return { fines, procedures };
};

const buildAppointments = (
  random: Random,
  now: Date,
  procedures: DemoProcedure[]
) =>
  procedures
    .filter(
      (item) =>
        item.status === "pending" &&
        DEMO_PROCEDURE_TYPES.some(
          (type) =>
            type.code === item.procedureTypeCode && type.requiresAppointment
        )
    )
    .map((item, index): DemoAppointment => {
      const isPast = index % 3 === 0;
      const days = isPast ? -random.int(1, 20) : random.int(1, 15);
      return {
        documentNumber: item.documentNumber,
        entityTaxId: item.entityTaxId,
        branchName: branchOf(item.entityTaxId),
        procedureTypeCode: item.procedureTypeCode,
        obligationNumber: item.number,
        scheduledAt: bogotaTime(
          now,
          workday(now, days),
          random.int(8, 15),
          random.pick([0, 30] as const)
        ),
        status: isPast
          ? random.pick([
              "attended",
              "attended",
              "no_show",
              "cancelled",
            ] as const)
          : "scheduled",
      };
    });

const SESSION_PLAN = [
  { days: -14, entityTaxId: ITTB, discountPercent: 50 },
  { days: -9, entityTaxId: CEA, discountPercent: 50 },
  { days: -4, entityTaxId: ITTB, discountPercent: 25 },
  { days: 2, entityTaxId: ITTB, discountPercent: 50 },
  { days: 5, entityTaxId: CEA, discountPercent: 50 },
  { days: 9, entityTaxId: ITTB, discountPercent: 25 },
  { days: 13, entityTaxId: CEA, discountPercent: 50 },
] as const;

const enrollmentStatus = (isPast: boolean, attended: boolean) => {
  if (!isPast) {
    return "enrolled";
  }
  return attended ? "attended" : "absent";
};

const buildCourses = (random: Random, now: Date, fines: DemoFine[]) => {
  const sessions = SESSION_PLAN.map((plan): DemoCourseSession => {
    const day = workday(now, plan.days);
    return {
      entityTaxId: plan.entityTaxId,
      branchName: branchOf(plan.entityTaxId),
      startsAt: bogotaTime(now, day, 8),
      endsAt: bogotaTime(now, day, 12),
      capacity: 20,
      discountPercent: plan.discountPercent,
    };
  });
  const enrollments: DemoEnrollment[] = [];
  for (const fine of fines) {
    if (fine.status === "pending" && random.next() < 0.45) {
      // A session after the fine, where the citizen has no enrollment yet.
      const options = sessions.filter(
        (session) =>
          session.startsAt > fine.issuedAt &&
          !enrollments.some(
            (item) =>
              item.documentNumber === fine.documentNumber &&
              item.startsAt === session.startsAt
          )
      );
      if (options.length > 0) {
        const session = random.pick(options);
        const isPast = session.endsAt < now;
        const attended = isPast && random.next() < 0.7;
        enrollments.push({
          documentNumber: fine.documentNumber,
          branchName: session.branchName,
          startsAt: session.startsAt,
          fineEntityTaxId: fine.entityTaxId,
          fineNumber: fine.number,
          status: enrollmentStatus(isPast, attended),
          attendedAt: attended ? session.endsAt : null,
        });
      }
    }
  }
  return { sessions, enrollments };
};

/** The domain data. Dates are relative to `now`. The rest is the same on each run. */
export const buildDemoDomain = (now: Date) => {
  const random = createRandom(1096);
  const vehicles = buildVehicles(random);
  const { fines, procedures } = buildObligations(random, now, vehicles);
  const appointments = buildAppointments(random, now, procedures);
  const { sessions, enrollments } = buildCourses(random, now, fines);
  return { vehicles, fines, procedures, appointments, sessions, enrollments };
};
