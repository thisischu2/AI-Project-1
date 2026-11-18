/**
 * Input validation for everything the browser sends to the server.
 * Requests that don't match are rejected before any AI call is made.
 */
import { z } from "zod";
import { CATEGORIES, INTERACTION_KINDS } from "./types";

const str = (max: number) => z.string().max(max);
const list = (max: number) => z.array(str(120)).max(max).default([]);

export const ContactSchema = z.object({
  id: str(80),
  name: str(120).min(1),
  email: str(200).optional(),
  phone: str(60).optional(),
  location: str(120).optional(),
  occupation: str(120).optional(),
  organization: str(120).optional(),
  categories: z.array(z.enum(CATEGORIES)).max(8).default([]),
  tags: list(30),
  interests: list(30),
  goals: list(20),
  skills: list(30),
  metContext: str(500).optional(),
  notes: str(4000).optional(),
  importantDates: z.array(z.object({ label: str(80), date: str(10) })).max(20).default([]),
  isDemo: z.boolean().optional(),
});

export const ConnectionSchema = z.object({
  id: str(80),
  sourceId: str(80),
  targetId: str(80),
  label: str(120).optional(),
});

export const InteractionSchema = z.object({
  id: str(80),
  contactId: str(80),
  kind: z.enum(INTERACTION_KINDS),
  date: str(10),
  summary: str(2000),
});

export const NetworkPayloadSchema = z.object({
  profileName: str(120).default("You"),
  priorities: list(10),
  contacts: z.array(ContactSchema).max(2000),
  connections: z.array(ConnectionSchema).max(10000),
  interactions: z.array(InteractionSchema).max(5000).default([]),
});

export type NetworkPayload = z.infer<typeof NetworkPayloadSchema>;
export type PayloadContact = z.infer<typeof ContactSchema>;

export const AskRequestSchema = z.object({
  question: str(1000).min(1),
  network: NetworkPayloadSchema,
});

export const ExtractRequestSchema = z.object({
  note: str(6000).min(1),
  today: str(10),
  contactId: str(80).optional(),
  network: NetworkPayloadSchema,
});

export const DiscoverRequestSchema = z.object({ network: NetworkPayloadSchema });

export const DraftIntroRequestSchema = z.object({
  aId: str(80),
  bId: str(80),
  reason: str(1000),
  consentConfirmed: z.literal(true),
  network: NetworkPayloadSchema,
});
