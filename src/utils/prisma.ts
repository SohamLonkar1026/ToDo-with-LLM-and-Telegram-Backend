import { PrismaClient } from "@prisma/client";
import env from "../config/env";

const prisma = new PrismaClient({
    log: env.NODE_ENV === 'production' ? ['error'] : ['query', 'info', 'warn', 'error']
});

export default prisma;
