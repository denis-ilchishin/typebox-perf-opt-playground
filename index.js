import { parseArgs } from "node:util";

import { TypeCompiler } from "@sinclair/typebox/compiler";
import { Type } from "@sinclair/typebox/type";
import { Value } from "@sinclair/typebox/value";
import { z } from "zod";


const { values: args } = parseArgs({
  options: {
    iterations: {
      type: "string",
      default: "10000",
      short: "i",
    },
  }
})

const triggerGC = globalThis.gc

const iterations = Number.parseInt(args.iterations)

const zodSchema = z.object({
  prop1: z.string(),
  prop2: z.number(),
  prop3: z.boolean(),
  prop4: z.literal("literal"),
  prop5: z.array(z.string()),
  prop6: z.object({
    prop1: z.array(z.object({
      prop1: z.string(),
      prop2: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("type1"),
          prop1: z.string()
        }),
        z.object({
          type: z.literal("type2"),
          prop1: z.number().optional().default(1),
          prop2: z.coerce.number(),
          prop3: z.string().transform((value) => `"${value}"`),
        })
      ])
    })),

  })
})

const typeboxSchema = Type.Object({
  prop1: Type.String(),
  prop2: Type.Number(),
  prop3: Type.Boolean(),
  prop4: Type.Literal("literal"),
  prop5: Type.Array(Type.String()),
  prop6: Type.Object({
    prop1: Type.Array(Type.Object({
      prop1: Type.String(),
      prop2: Type.Union([
        Type.Object({
          type: Type.Literal("type1"),
          prop1: Type.String()
        }),
        Type.Object({
          type: Type.Literal("type2"),
          prop1: Type.Optional(Type.Number({ default: 1 })),
          prop2: Type.Number(),
          prop3: Type.Transform(Type.String()).Decode((value) => `"${value}"`).Encode(value => value.slice(1, -1))
        })
      ])
    })),

  })
})

const typeboxSchemaCompiled = TypeCompiler.Compile(typeboxSchema)

// prop2 wont be converted by typebox without Value.Convert, so provide a default value to avoid errors
const value = (prop2 = '1') => ({
  prop1: "string",
  prop2: 1,
  prop3: true,
  prop4: "literal",
  prop5: ["string"],
  prop6: {
    prop1: Array.from({ length: 25 }).map(() => ({
      prop1: "string",
      prop2: {
        type: "type2",
        prop2,
        prop3: "string"
      }
    })),
  }
})


function run(name, iterations, cb) {
  triggerGC?.() // trigger garbage collection before running the benchmark
  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) {
    cb()
  }
  const end = process.hrtime.bigint()
  return {
    name,
    iterations,
    time: end - start
  }
}

function print(...results) {
  console.table(results.map(({ name, iterations, time }, i) => ({
    name,
    iterations,
    time: ((Number(time) / 1e6).toFixed(3) + " ms").padStart(14),
    performance: (i === 0 ? 1 : Number(results[0].time) / Number(time)).toFixed(2) + 'x'
  })))
}


const runZod = () => run("Zod", iterations, () => {
  return zodSchema.parse(value())
})

const runTypeboxWithParse = () => run("Typebox with Parse", iterations, () => {
  return typeboxSchemaCompiled.Decode(Value.Parse(["Clone", "Convert", "Clean", "Default"], typeboxSchema, value()))
})

const runTypeboxWithoutParse = () => run("Typebox without Parse", iterations, () => {
  return typeboxSchemaCompiled.Decode(value(1))
})


console.log(`Running ${iterations.toLocaleString()} iterations with GC exposed:`, !!triggerGC)

print(
  runTypeboxWithoutParse(),
  runTypeboxWithParse(),
  runZod(),
)