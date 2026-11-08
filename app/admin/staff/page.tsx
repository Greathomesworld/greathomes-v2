'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminTable, ColumnDef } from '@/src/components/admin/AdminTable';
import { AdminStatCard } from '@/src/components/admin/AdminStatCard';
import { AdminFilterBar, FilterOption } from '@/src/components/admin/AdminFilterBar';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { AdminSearch } from '@/src/components/admin/AdminSearch';
import { useAdminAuth } from '@/src/components/admin/AdminAuthProvider';
import { StaffPublicDto } from '@/src/domain/auth/dto/staffDto';
import { ALLOWED_STAFF_ROLES, type StaffRole } from '@/src/domain/auth/roles';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  Users,
  ShieldCheck,
  UserCheck,
  UserX,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Key,
} from 'lucide-react';

export default function AdminStaffPage() {
  const { hasCapability } = useAdminAuth();

  const [staffList, setStaffList] = useState<StaffPublicDto[]>([]);
  const [total, setTotal] = useState(0);
  const [activeSuperAdminCount, setActiveSuperAdminCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  // Dialog states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<StaffRole>('SALES');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Role edit modal
  const [roleModalStaff, setRoleModalStaff] = useState<StaffPublicDto | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<StaffRole>('SALES');
  const [updatingRole, setUpdatingRole] = useState(false);
  const [roleUpdateError, setRoleUpdateError] = useState<string | null>(null);

  // Status toggle confirmation
  const [statusConfirmStaff, setStatusConfirmStaff] = useState<StaffPublicDto | null>(null);
  const [statusActionLoading, setStatusActionLoading] = useState(false);

  // Capabilities inspection modal
  const [inspectCapabilitiesStaff, setInspectCapabilitiesStaff] = useState<StaffPublicDto | null>(null);

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedRole !== 'ALL') params.append('role', selectedRole);
      if (selectedStatus !== 'ALL') params.append('enabled', selectedStatus === 'ACTIVE' ? 'true' : 'false');
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      const res = await fetch(`/api/admin/staff?${params.toString()}`, {
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        if (res.status === 403) {
          setError('Access Denied: You lack permissions (staff.read) to view the staff registry.');
        } else {
          setError('Failed to load staff roster.');
        }
        setStaffList([]);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setStaffList(data.data || []);
      setTotal(data.total || 0);
      setActiveSuperAdminCount(Number.isInteger(data.activeSuperAdminCount) ? data.activeSuperAdminCount : 0);
    } catch {
      setError('A network error occurred while loading staff accounts.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedRole, selectedStatus, page, limit]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          name: newStaffName,
          email: newStaffEmail,
          password: newStaffPassword,
          role: newStaffRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.message || 'Failed to create staff account.');
        setCreating(false);
        return;
      }

      setCreateModalOpen(false);
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPassword('');
      setNewStaffRole('SALES');
      fetchStaff();
    } catch {
      setCreateError('An unexpected error occurred.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!roleModalStaff) return;
    setUpdatingRole(true);
    setRoleUpdateError(null);

    try {
      const res = await fetch(`/api/admin/staff/${roleModalStaff.id}/role`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ role: selectedNewRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRoleUpdateError(data.message || 'Failed to update staff role.');
        setUpdatingRole(false);
        return;
      }

      setRoleModalStaff(null);
      fetchStaff();
    } catch {
      setRoleUpdateError('An unexpected network error occurred.');
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!statusConfirmStaff) return;
    setStatusActionLoading(true);

    try {
      const res = await fetch(`/api/admin/staff/${statusConfirmStaff.id}/status`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ enabled: !statusConfirmStaff.enabled }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to update status.');
        setStatusActionLoading(false);
        return;
      }

      setStatusConfirmStaff(null);
      fetchStaff();
    } catch {
      alert('A network error occurred.');
    } finally {
      setStatusActionLoading(false);
    }
  };

  // KPIs
  const totalStaff = total || staffList.length;
  const activeCount = staffList.filter((s) => s.enabled).length;
  const superAdminCount = activeSuperAdminCount;
  const operationsCount = staffList.filter((s) => ['ADMIN', 'CONTENT_MANAGER', 'PROPERTY_MANAGER', 'SALES'].includes(s.role)).length;

  const filterOptions: FilterOption[] = [
    {
      key: 'role',
      label: 'Staff Role',
      options: [
        { label: 'All Roles', value: 'ALL' },
        { label: 'Super Admin', value: 'SUPER_ADMIN' },
        { label: 'Operations Admin', value: 'ADMIN' },
        { label: 'Content Manager', value: 'CONTENT_MANAGER' },
        { label: 'Property Manager', value: 'PROPERTY_MANAGER' },
        { label: 'Sales Specialist', value: 'SALES' },
      ],
      value: selectedRole,
      onChange: (val) => {
        setSelectedRole(val);
        setPage(1);
      },
    },
    {
      key: 'status',
      label: 'Status',
      options: [
        { label: 'All Statuses', value: 'ALL' },
        { label: 'Active', value: 'ACTIVE' },
        { label: 'Disabled', value: 'DISABLED' },
      ],
      value: selectedStatus,
      onChange: (val) => {
        setSelectedStatus(val);
        setPage(1);
      },
    },
  ];

  const columns: ColumnDef<StaffPublicDto>[] = [
    {
      header: 'Staff Member',
      cell: (staff) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-display font-semibold text-xs text-white uppercase shrink-0">
            {staff.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .substring(0, 2)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-neutral-900 font-display truncate">
              {staff.name}
            </span>
            <span className="text-[11px] text-neutral-500 truncate">{staff.email}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Assigned Role',
      cell: (staff) => <AdminBadge variant={staff.role} size="sm" />,
    },
    {
      header: 'Account Status',
      cell: (staff) =>
        staff.enabled ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
            <XCircle className="h-3 w-3" />
            Disabled
          </span>
        ),
    },
    {
      header: 'Capabilities',
      cell: (staff) => (
        <button
          onClick={() => setInspectCapabilitiesStaff(staff)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[11px] font-mono transition-colors border border-neutral-200 cursor-pointer"
        >
          <Key className="h-3 w-3 text-terracotta" />
          <span>{staff.capabilities?.length || 0} permissions</span>
        </button>
      ),
    },
    {
      header: 'Joined / Updated',
      cell: (staff) => (
        <span className="text-[11px] text-neutral-500 font-mono">
          {new Date(staff.createdAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (staff) => {
        const canAssignRole = hasCapability('staff.assignRole');
        const canDisable = hasCapability('staff.disable');
        const isLastActiveSuperAdmin = staff.role === 'SUPER_ADMIN' && staff.enabled && activeSuperAdminCount <= 1;

        return (
          <div className="flex items-center justify-end gap-2">
            {canAssignRole && (
              <button
                onClick={() => {
                  setRoleModalStaff(staff);
                  setSelectedNewRole(staff.role);
                  setRoleUpdateError(null);
                }}
                title="Change Role"
                className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            )}

            {canDisable && (
              <button
                onClick={() => setStatusConfirmStaff(staff)}
                disabled={isLastActiveSuperAdmin}
                title={isLastActiveSuperAdmin ? 'Cannot disable the last active Super Admin' : staff.enabled ? 'Disable Account' : 'Enable Account'}
                aria-label={isLastActiveSuperAdmin ? 'Cannot disable the last active Super Admin' : staff.enabled ? 'Disable Account' : 'Enable Account'}
                className={`p-1.5 rounded-lg transition-colors ${isLastActiveSuperAdmin ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${
                  staff.enabled
                    ? 'bg-neutral-100 hover:bg-rose-50 text-neutral-700 hover:text-rose-700'
                    : 'bg-neutral-100 hover:bg-emerald-50 text-neutral-700 hover:text-emerald-700'
                }`}
              >
                {staff.enabled ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <AdminPageHeader
        title="Staff Roles & Permissions"
        description="Authoritative server-enforced role matrix, capability assignments, and staff accounts."
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Staff & Roles' },
        ]}
        primaryAction={
          hasCapability('staff.create')
            ? {
                label: 'Add Staff Member',
                icon: <Plus className="h-4 w-4" />,
                onClick: () => {
                  setCreateModalOpen(true);
                  setCreateError(null);
                },
              }
            : undefined
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AdminStatCard
          title="Total Staff"
          value={totalStaff}
          icon={<Users className="h-4 w-4" />}
        />
        <AdminStatCard
          title="Active Accounts"
          value={activeCount}
          badgeText="Operational"
          badgeVariant="success"
          icon={<UserCheck className="h-4 w-4" />}
        />
        <AdminStatCard
          title="Super Admins"
          value={superAdminCount}
          badgeText="Full Control"
          badgeVariant="amber"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <AdminStatCard
          title="Operational Roles"
          value={operationsCount}
          icon={<Key className="h-4 w-4" />}
        />
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-xs space-y-3">
        <div className="max-w-md">
          <AdminSearch
            value={searchQuery}
            onChange={(val) => {
              setSearchQuery(val);
              setPage(1);
            }}
            placeholder="Search staff by name, email, or role..."
          />
        </div>
        <AdminFilterBar
          filters={filterOptions}
          onReset={() => {
            setSearchQuery('');
            setSelectedRole('ALL');
            setSelectedStatus('ALL');
            setPage(1);
          }}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <AdminTable
        columns={columns}
        data={staffList}
        keyExtractor={(item) => item.id}
        isLoading={loading}
        emptyMessage="No staff members match the selected criteria."
      />

      {/* Create Staff Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-base font-bold text-neutral-900 font-display">Add New Staff Member</h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="e.g. Suman Sen"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="e.g. suman.sen@greathomes.in"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Initial Password (minimum 12 characters)</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={256}
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  placeholder="Create a temporary secure password"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
                <p className="mt-1 text-[11px] text-neutral-500">Share the initial password securely with the staff member.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Staff Role</label>
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as StaffRole)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
                >
                  {ALLOWED_STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold font-display disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Change Modal */}
      {roleModalStaff && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-base font-bold text-neutral-900 font-display">Change Staff Role</h3>
              <button
                onClick={() => setRoleModalStaff(null)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-600 font-body">
              Update role assignment for <strong className="text-neutral-900">{roleModalStaff.name}</strong> ({roleModalStaff.email}).
            </p>

            {roleUpdateError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {roleUpdateError}
              </div>
            )}

            {roleModalStaff.role === 'SUPER_ADMIN' && roleModalStaff.enabled && activeSuperAdminCount <= 1 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                This is the last active Super Admin. Its account cannot be disabled or assigned a different role until another active Super Admin exists.
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">New Role</label>
              <select
                value={selectedNewRole}
                onChange={(e) => setSelectedNewRole(e.target.value as StaffRole)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
              >
                {ALLOWED_STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setRoleModalStaff(null)}
                className="px-4 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRole}
                disabled={updatingRole || selectedNewRole === roleModalStaff.role || (roleModalStaff.role === 'SUPER_ADMIN' && roleModalStaff.enabled && activeSuperAdminCount <= 1 && selectedNewRole !== 'SUPER_ADMIN')}
                className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold font-display disabled:opacity-50"
              >
                {updatingRole ? 'Updating...' : 'Confirm Role Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Status Confirm */}
      <AdminConfirmDialog
        isOpen={!!statusConfirmStaff}
        title={statusConfirmStaff?.enabled ? 'Disable Staff Account' : 'Enable Staff Account'}
        message={`Are you sure you want to ${
          statusConfirmStaff?.enabled ? 'disable' : 'enable'
        } ${statusConfirmStaff?.name}? ${
          statusConfirmStaff?.enabled
            ? 'Disabled accounts cannot authenticate or perform mutations.'
            : 'Account will immediately regain their role capabilities.'
        }`}
        confirmLabel={statusConfirmStaff?.enabled ? 'Disable Account' : 'Enable Account'}
        isDestructive={!!statusConfirmStaff?.enabled}
        isLoading={statusActionLoading}
        onConfirm={handleToggleStatus}
        onCancel={() => setStatusConfirmStaff(null)}
      />

      {/* Capabilities Inspection Modal */}
      {inspectCapabilitiesStaff && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl max-w-xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-terracotta" />
                <h3 className="text-base font-bold text-neutral-900 font-display">
                  Derived Capabilities: {inspectCapabilitiesStaff.name}
                </h3>
              </div>
              <button
                onClick={() => setInspectCapabilitiesStaff(null)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 border border-neutral-200 shrink-0">
              <div>
                <span className="text-[11px] text-neutral-500 block">Role</span>
                <AdminBadge variant={inspectCapabilitiesStaff.role} size="sm" />
              </div>
              <div>
                <span className="text-[11px] text-neutral-500 block">Total Capabilities</span>
                <span className="text-xs font-mono font-semibold text-neutral-900">
                  {inspectCapabilitiesStaff.capabilities?.length || 0}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <span className="text-xs font-semibold text-neutral-700 block">Active Permissions:</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {inspectCapabilitiesStaff.capabilities?.map((cap) => (
                  <div
                    key={cap}
                    className="p-2 rounded bg-neutral-50 border border-neutral-200 text-[11px] font-mono text-neutral-700 flex items-center gap-2"
                  >
                    <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span className="truncate">{cap}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-200 flex justify-end shrink-0">
              <button
                onClick={() => setInspectCapabilitiesStaff(null)}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-xs font-semibold font-display hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
