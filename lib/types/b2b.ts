/**
 * B2B/B2C Hybrid Database Schema Types
 * 
 * This file defines TypeScript interfaces for the new B2B features including:
 * - Organizations (corporate accounts)
 * - Org Units (hierarchical structure within organizations)
 * - Enhanced Profiles with B2B fields
 */

// ==========================================
// Organizations
// ==========================================

export interface Organization {
  /** Primary key (UUID v4) */
  id: string;
  
  /** Company legal name */
  name: string;
  
  /** Domain for auto-join (optional, e.g., '@acme.com') */
  domain?: string;
  
  /** Plan tier: starter, business, enterprise */
  planTier: 'starter' | 'business' | 'enterprise';
  
  /** Account status */
  status: 'active' | 'suspended' | 'trial' | 'cancelled';
  
  /** Maximum licensed seats */
  maxSeats: number;
  
  /** Currently used seats */
  usedSeats: number;
  
  /** Billing email for invoices */
  billingEmail: string;
  
  /** Primary admin user ID */
  adminUserId?: string;
  
  /** Contract start date (ISO 8601) */
  contractStartDate?: string;
  
  /** Contract end date (ISO 8601) */
  contractEndDate?: string;
  
  /** Billing cycle */
  billingCycle?: 'monthly' | 'annual' | 'custom';
  
  /** Industry classification */
  industry?: string;
  
  /** Country code (ISO 3166-1 alpha-2) */
  country?: string;
  
  /** Tax ID / VAT number */
  taxId?: string;
  
  /** Custom metadata */
  metadata?: Record<string, any>;
  
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
  
  /** Optional expiration for TTL */
  expiresAt?: number; // UNIX timestamp
}

// ==========================================
// Organizational Units (Hierarchical Structure)
// ==========================================

export interface OrgUnit {
  /** Primary key (UUID v4) */
  id: string;
  
  /** Parent organization ID */
  orgId: string;
  
  /** Unit name (e.g., 'Engineering', 'Sales - West Coast') */
  name: string;
  
  /** Parent unit ID (null for root units) */
  parentId?: string | null;
  
  /** Hierarchical path (e.g., '/engineering/backend' or '/sales/west') */
  path: string;
  
  /** Hierarchy level (0 = root, 1 = child of root, etc.) */
  level: number;
  
  /** Manager/admin user ID for this unit */
  managerId?: string;
  
  /** Description */
  description?: string;
  
  /** Status */
  status: 'active' | 'archived';
  
  /** Custom metadata */
  metadata?: Record<string, any>;
  
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
}

// ==========================================
// Enhanced Profile with B2B Fields
// ==========================================

export interface ProfileB2B {
  /** Primary key (UUID v4 or email-based ID for legacy) */
  id: string;
  
  /** Email (unique, used for login) */
  email: string;
  
  /** First name */
  firstName?: string;
  
  /** Last name */
  lastName?: string;
  
  /** User role */
  role: 'student' | 'teacher' | 'admin';
  
  /** Subscription plan (B2C) or null for B2B users */
  plan: 'basic' | 'pro' | 'elite' | 'viewer' | null;
  
  // --- B2B specific fields ---
  
  /** Parent organization ID (null for B2C users) */
  orgId?: string | null;
  
  /** Assigned org unit ID */
  orgUnitId?: string | null;
  
  /** Is this a B2B (corporate) account? */
  isB2B: boolean;
  
  /** Is this user an org admin? */
  isOrgAdmin?: boolean;
  
  /** Assigned license ID (for tracking seat usage) */
  licenseId?: string | null;
  
  // --- Standard fields ---
  
  /** Password hash (server-side only) */
  password?: string;
  
  /** Birthdate */
  birthdate?: string;
  
  /** Gender */
  gender?: string;
  
  /** Country code */
  country?: string;
  
  /** Bio/description */
  bio?: string;
  
  /** Terms accepted */
  termsAccepted?: boolean;
  
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
}

// ==========================================
// Licenses (Seat Management)
// ==========================================

export interface License {
  /** Primary key (UUID v4) */
  licenseId: string;
  
  /** Parent organization ID */
  organizationId: string;
  
  /** Assigned user ID (null if unassigned) */
  userId?: string | null;
  
  /** Associated course ID (optional, for course-specific licenses) */
  courseId?: string | null;
  
  /** License status */
  status: 'active' | 'revoked' | 'expired' | 'pending';
  
  /** Assignment timestamp */
  assignedAt?: string;
  
  /** Who assigned this license */
  assignedBy?: string;
  
  /** Expiration timestamp (for TTL) */
  expiresAt?: number; // UNIX timestamp
  
  /** License type metadata */
  metadata?: {
    licenseType?: 'full' | 'trial' | 'demo';
    restrictions?: string[];
  };
  
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
}

// ==========================================
// Helper Types
// ==========================================

export type AccountType = 'individual' | 'corporate';
export type BillingType = 'individual' | 'corporate';

export interface CreateOrganizationInput {
  name: string;
  domain?: string;
  planTier: 'starter' | 'business' | 'enterprise';
  maxSeats: number;
  billingEmail: string;
  adminUserId?: string;
  industry?: string;
  country?: string;
  taxId?: string;
}

export interface CreateOrgUnitInput {
  orgId: string;
  name: string;
  parentId?: string | null;
  managerId?: string;
  description?: string;
}

export interface UpdateOrgUnitInput {
  name?: string;
  managerId?: string;
  description?: string;
  status?: 'active' | 'archived';
}
