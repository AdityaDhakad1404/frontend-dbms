/**
 * SMART HEALTH MONITORING SYSTEM — DOCTOR-PATIENT MESSAGING SERVICE
 * 
 * Interacts with agreed FastAPI endpoints:
 * - GET /api/v1/messages?patient_id={id} (queries consultation messages for authorized conversation)
 * - POST /api/v1/messages (submits clinical message to assigned patient)
 * 
 * STRICT ARCHITECTURAL CONSTRAINTS:
 * 1. SIMULATED DATA — NOT FOR MEDICAL USE.
 * 2. Enforces conversation membership based on doctor-patient assignments.
 * 3. Never logs message bodies, tokens, or sensitive health data to console.
 * 4. Content rendered as text; never HTML.
 * 5. Handles development fixtures when local gateway is offline.
 */

import { apiRequest } from './client';
import { getFixtureMessages, sendFixtureMessage } from './fixtures';
import type { ClinicalMessage } from '../types';

export interface RawMessageDto {
  message_id?: string;
  messageId?: string;
  id?: string;
  sender_id?: string;
  senderId?: string;
  receiver_id?: string;
  receiverId?: string;
  patient_id?: string;
  patientId?: string;
  content?: string;
  text?: string;
  message?: string;
  created_at?: string;
  createdAt?: string;
  read_at?: string | null;
  readAt?: string | null;
}

/**
 * Normalizes raw API message DTO into typed ClinicalMessage.
 */
export function normalizeMessage(
  dto: RawMessageDto,
  currentUserId?: string,
  targetPatientId?: string
): ClinicalMessage {
  const messageId =
    dto.message_id ||
    dto.messageId ||
    dto.id ||
    `msg_${Math.random().toString(36).substring(2, 9)}`;
  const senderId = dto.sender_id || dto.senderId || 'usr_unknown';
  const receiverId =
    dto.receiver_id ||
    dto.receiverId ||
    dto.patient_id ||
    dto.patientId ||
    targetPatientId ||
    'P_UNKNOWN';
  const patientId = dto.patient_id || dto.patientId || targetPatientId || receiverId;
  const content = dto.content || dto.text || dto.message || '';
  const createdAt = dto.created_at || dto.createdAt || new Date().toISOString();
  const readAt = dto.read_at || dto.readAt || null;

  // Determine if message originated from clinician
  let isFromDoctor = false;
  if (currentUserId && senderId === currentUserId) {
    isFromDoctor = true;
  } else if (senderId.startsWith('usr_doc') || senderId.toLowerCase().includes('doc')) {
    isFromDoctor = true;
  } else if (targetPatientId && receiverId === targetPatientId && senderId !== targetPatientId) {
    isFromDoctor = true;
  }

  return {
    messageId,
    senderId,
    receiverId,
    patientId,
    content,
    createdAt,
    readAt,
    isFromDoctor,
  };
}

export interface GetMessagesOptions {
  patientId?: string;
  useFixtures?: boolean;
  currentUserId?: string;
}

/**
 * Retrieves consultation messages from FastAPI backend or development fixtures.
 * GET /api/v1/messages?patient_id={id}
 */
export async function getMessages(
  options: GetMessagesOptions = {}
): Promise<ClinicalMessage[]> {
  const { patientId, useFixtures = false, currentUserId } = options;

  if (useFixtures) {
    return getFixtureMessages(patientId);
  }

  const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : '';
  const data = await apiRequest<
    RawMessageDto[] | { data: RawMessageDto[] } | { messages: RawMessageDto[] }
  >(`/messages${query}`);

  let rawList: RawMessageDto[] = [];
  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && typeof data === 'object') {
    if ('data' in data && Array.isArray(data.data)) {
      rawList = data.data;
    } else if ('messages' in data && Array.isArray(data.messages)) {
      rawList = data.messages;
    }
  }

  const normalized = rawList.map((m) => normalizeMessage(m, currentUserId, patientId));
  // Sort chronologically ascending for standard chat view
  return normalized.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime() || 0;
    const timeB = new Date(b.createdAt).getTime() || 0;
    return timeA - timeB;
  });
}

export interface SendMessagePayload {
  receiverId: string;
  content: string;
}

export interface SendMessageOptions {
  useFixtures?: boolean;
  currentUserId?: string;
}

/**
 * Sends a consultation message to an assigned patient.
 * POST /api/v1/messages
 */
export async function postMessage(
  payload: SendMessagePayload,
  options: SendMessageOptions = {}
): Promise<ClinicalMessage> {
  const { useFixtures = false, currentUserId = 'usr_doc_01' } = options;

  if (useFixtures) {
    return sendFixtureMessage(payload.receiverId, payload.content, currentUserId);
  }

  const data = await apiRequest<
    RawMessageDto | { data: RawMessageDto } | { message: RawMessageDto }
  >('/messages', {
    method: 'POST',
    body: JSON.stringify({
      receiver_id: payload.receiverId,
      patient_id: payload.receiverId,
      content: payload.content.trim(),
    }),
  });

  let raw: RawMessageDto = {};
  if (data && typeof data === 'object') {
    if ('data' in data && data.data && typeof data.data === 'object') {
      raw = data.data as RawMessageDto;
    } else if ('message' in data && data.message && typeof data.message === 'object') {
      raw = data.message as RawMessageDto;
    } else {
      raw = data as RawMessageDto;
    }
  }

  return normalizeMessage(raw, currentUserId, payload.receiverId);
}
