import { Node, Edge } from '@xyflow/react';

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  nodes: Node[];
  edges: Edge[];
  allowedRoles?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TriggerPayload {
  triggerType: string;
  data: any;
}

export type TriggerType = 'trigger_enrollment' | 'trigger_point_purchase' | 'trigger_course_created';
export type ActionType = 'action_send_email' | 'action_grant_points' | 'action_change_course_status';
