import React, { useState, useEffect } from 'react';
import { 
  Shield, Users, CheckSquare, Car, Compass, MapPin, Activity, 
  FileText, MessageSquare, LogOut, Moon, Sun, Search, Filter, 
  Trash2, Ban, Check, X, RotateCcw, Download, AlertTriangle, 
  TrendingUp, Coins, Clock, ArrowUpRight, BarChart2, PieChart, 
  RefreshCw, CheckCircle, XCircle, HelpCircle, Eye, EyeOff, ChevronRight,
  Archive, Database, Menu, CreditCard
} from 'lucide-react';
import { 
  getUsers, saveUsers, getRides, saveRides, 
  getBookings, saveBookings, getPayments, getReviews, 
  getComplaints, saveComplaints, resolveComplaint, getNotifications, 
  getLoginLogs, saveLoginLogs, getActivityLogs, 
  addActivityLog, sendPushNotification, isSystemAdminEmail,
  approveStudentRequest, rejectStudentRequest, deleteUserAccount, updateUserProfile,
  createCloudBackup, getCloudBackups, deleteCloudBackup, restoreDatabaseFromJSON, DatabaseBackup, clearDatabaseToAdmins,
  getMessages, saveMessages
} from '../data/db';
import { User, Ride, Booking, Complaint, Review, LoginLog, ActivityLog } from '../types';
import { decryptPassword, encryptPassword, hashPassword } from '../lib/crypto';

const displayPass = (user: any, adminUser?: any) => {
  let viewer = adminUser;
  if (!viewer) {
    const raw = localStorage.getItem('campusride_current_user');
    if (raw) {
      try { viewer = JSON.parse(raw); } catch (e) {}
    }
  }
  const isViewerAdmin = viewer && (viewer.isAdmin || isSystemAdminEmail(viewer.email));
  if (!isViewerAdmin) {
    return '••••••••';
  }
  if (!user) return '••••••••';
  if (user.passwordEncrypted) {
    try {
      return decryptPassword(user.passwordEncrypted);
    } catch {
      return 'campus123';
    }
  }
  if (user.password) {
    return user.password;
  }
  return '•••••••• (Secure Hash)';
};
import { LOCATION_COORDINATES, getCoordinates, calculateDistanceKm } from '../data/colleges';
import InteractiveMap from './InteractiveMap';

// Recharts components
import { 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart as RePieChart, Pie, Cell 
} from 'recharts';

interface AdminDashboardProps {
  onLogout: () => void;
  adminUser: User;
  onSwitchToStudentView?: () => void;
  dbRefreshTrigger?: number;
}

type TabType = 'overview' | 'approvals' | 'users' | 'riders' | 'rides' | 'map' | 'sessions' | 'audit' | 'feedback' | 'reports' | 'backups' | 'subscriptions';

export default function AdminDashboard({ onLogout, adminUser, onSwitchToStudentView, dbRefreshTrigger }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('campusride_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'dark';
  });
  const [isAdminSidebarOpen, setIsAdminSidebarOpen] = useState(false);

  // Backup & DB Persistence states
  const [cloudBackups, setCloudBackups] = useState<DatabaseBackup[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [newBackupName, setNewBackupName] = useState('');
  const [backupSuccessMessage, setBackupSuccessMessage] = useState('');
  const [backupErrorMessage, setBackupErrorMessage] = useState('');
  const [showRestoreConfirmId, setShowRestoreConfirmId] = useState<string | null>(null);
  const [showJSONRestoreConfirm, setShowJSONRestoreConfirm] = useState(false);
  const [importedJSON, setImportedJSON] = useState<any | null>(null);

  const handleClearAllData = async () => {
    if (!window.confirm("Are you absolutely sure you want to delete all registered passengers, riders, rides, bookings, reviews, complaints, and logs? Only admin accounts will be retained. This action is irreversible.")) {
      return;
    }
    try {
      setIsWiping(true);
      setBackupSuccessMessage('');
      setBackupErrorMessage('');
      await clearDatabaseToAdmins(adminUser);
      setBackupSuccessMessage('Success: All accounts, rides, bookings, and logs have been completely wiped. Only admin accounts remain.');
      reloadData();
    } catch (e) {
      setBackupErrorMessage(e instanceof Error ? e.message : 'An error occurred during database wipe.');
    } finally {
      setIsWiping(false);
    }
  };

  // Real-time states pulled from LocalStorage db
  const [users, setUsers] = useState<User[]>([]);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [rides, setRides] = useState<Ride[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // Filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'passenger' | 'rider'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('approved');
  const [collegeFilter, setCollegeFilter] = useState('all');

  // Interactive dialog triggers
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [isEditingAdmin, setIsEditingAdmin] = useState(false);
  const [editAdminForm, setEditAdminForm] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    collegeName: '',
  });

  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordChangeUserId, setPasswordChangeUserId] = useState<string | null>(null);

  const handleUpdateUserPassword = async (userId: string, userEmail: string) => {
    if (!adminNewPassword || adminNewPassword.trim().length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }
    try {
      setIsUpdatingPassword(true);
      const enc = encryptPassword(adminNewPassword.trim());
      const hash = hashPassword(adminNewPassword.trim(), userEmail);
      
      await updateUserProfile(userId, {
        passwordEncrypted: enc,
        passwordHash: hash
      });
      
      // Update our local state
      setRevealedPasswords(prev => ({ ...prev, [userId]: true }));
      setAdminNewPassword('');
      setPasswordChangeUserId(null);
      
      // Trigger update/reload
      reloadData();
      
      // If we are currently viewing this user, update the viewingUser state so it reflects the new password instantly
      if (viewingUser && viewingUser.id === userId) {
        setViewingUser(prev => prev ? { ...prev, passwordEncrypted: enc, passwordHash: hash } : null);
      }
      
      alert(`Password successfully changed for ${userEmail}!`);
    } catch (e: any) {
      console.error(e);
      alert("Failed to update password: " + (e.message || e));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  useEffect(() => {
    if (viewingUser) {
      setEditAdminForm({
        fullName: viewingUser.fullName,
        email: viewingUser.email,
        phoneNumber: viewingUser.phoneNumber,
        collegeName: viewingUser.collegeName || '',
      });
      setIsEditingAdmin(false);
    }
  }, [viewingUser]);

  const [selectedPendingRequest, setSelectedPendingRequest] = useState<User | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    user: User | null;
    actionType: 'suspend' | 'ban' | 'reactivate' | 'delete' | null;
  }>({
    isOpen: false,
    user: null,
    actionType: null
  });
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // In-App Toast for Admin (prevents sandbox iframe alert blocks)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [showCancelSubConfirm, setShowCancelSubConfirm] = useState(false);
  const [cancelSubUser, setCancelSubUser] = useState<User | null>(null);
  const [isProcessingCancelSub, setIsProcessingCancelSub] = useState(false);
  const [inspectingVerification, setInspectingVerification] = useState<{ user: User; side: 'front' | 'back' } | null>(null);
  const [responseTicketId, setResponseTicketId] = useState<string | null>(null);
  const [ticketResponseText, setTicketResponseText] = useState('');

  // Selected ride for map tracking
  const [selectedTrackingRide, setSelectedTrackingRide] = useState<Ride | null>(null);
  const [simulatedProgress, setSimulatedProgress] = useState(45);

  // Auto reload state to simulate live synchronisation
  const [isRefreshing, setIsRefreshing] = useState(false);


  const reloadData = () => {
    setIsRefreshing(true);
    setUsers(getUsers());
    setRides(getRides());
    setBookings(getBookings());
    setComplaints(getComplaints());
    setLoginLogs(getLoginLogs());
    setActivityLogs(getActivityLogs());
    setIsRefreshing(false);
  };

  useEffect(() => {
    reloadData();
    // Setup background interval lock for live syncing
    const timer = setInterval(() => {
      setUsers(getUsers());
      setRides(getRides());
      setBookings(getBookings());
      setComplaints(getComplaints());
      setLoginLogs(getLoginLogs());
      setActivityLogs(getActivityLogs());
    }, 4500);

    return () => clearInterval(timer);
  }, [dbRefreshTrigger]);

  // Update theme setting
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    localStorage.setItem('campusride_theme', theme);
  }, [theme]);

  // Load and refresh cloud backups list
  const loadCloudBackupsList = async () => {
    setIsLoadingBackups(true);
    setBackupSuccessMessage('');
    setBackupErrorMessage('');
    try {
      const list = await getCloudBackups();
      setCloudBackups(list);
    } catch (e: any) {
      console.error("Failed to fetch cloud backups:", e);
      setBackupErrorMessage(`Failed to fetch cloud backups: ${e.message || e}`);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'backups') {
      loadCloudBackupsList();
    }
  }, [activeTab]);

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBackupName.trim()) {
      setBackupErrorMessage('Please enter a descriptive backup label name.');
      return;
    }
    setIsLoadingBackups(true);
    setBackupSuccessMessage('');
    setBackupErrorMessage('');
    try {
      await createCloudBackup(adminUser, newBackupName.trim());
      setNewBackupName('');
      setBackupSuccessMessage('Database Cloud Backup securely created and saved into Firestore successfully!');
      await loadCloudBackupsList();
      reloadData();
    } catch (e: any) {
      console.error("Failed to create cloud backup:", e);
      setBackupErrorMessage(`Backup failed: ${e.message || e}`);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    setIsLoadingBackups(true);
    setBackupSuccessMessage('');
    setBackupErrorMessage('');
    try {
      await deleteCloudBackup(backupId, adminUser);
      setBackupSuccessMessage('Cloud Backup record deleted successfully.');
      await loadCloudBackupsList();
    } catch (e: any) {
      console.error("Failed to delete cloud backup:", e);
      setBackupErrorMessage(`Deletion failed: ${e.message || e}`);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleRestoreFromCloud = async (backup: DatabaseBackup) => {
    setIsLoadingBackups(true);
    setBackupSuccessMessage('');
    setBackupErrorMessage('');
    try {
      await restoreDatabaseFromJSON(backup.dataString, adminUser);
      setBackupSuccessMessage(`Database restored successfully from cloud snapshot: "${backup.backupName}"!All connected students will synchronise to this state instantly.`);
      setShowRestoreConfirmId(null);
      reloadData();
    } catch (e: any) {
      console.error("Restoration failed:", e);
      setBackupErrorMessage(`Restoration failed: ${e.message || e}`);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleDownloadLocalBackupJSON = () => {
    try {
      const collectionsToBackup = {
        campusride_users: getUsers(),
        campusride_rides: getRides(),
        campusride_bookings: getBookings(),
        campusride_payments: getPayments(),
        campusride_reviews: getReviews(),
        campusride_complaints: getComplaints(),
        campusride_notifications: getNotifications(),
        campusride_messages: getMessages(),
        campusride_login_logs: getLoginLogs(),
        campusride_activity_logs: getActivityLogs()
      };

      const payload = {
        backupVersion: "v1.0",
        backupTimestamp: new Date().toISOString(),
        createdByName: adminUser.fullName,
        createdByEmail: adminUser.email,
        collections: collectionsToBackup
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `campusride_full_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setBackupSuccessMessage('Local offline backup file generated and downloaded successfully!');
    } catch (e: any) {
      setBackupErrorMessage(`Failed to export data: ${e.message || e}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = e.target.files?.[0];
    if (!file) return;

    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.collections && !parsed.campusride_users) {
          throw new Error("Invalid schema context. Backup file format not recognized.");
        }
        setImportedJSON(parsed);
        setShowJSONRestoreConfirm(true);
        setBackupErrorMessage('');
      } catch (err: any) {
        setBackupErrorMessage(`Invalid file format: ${err.message || err}`);
        setImportedJSON(null);
      }
    };
    fileReader.readAsText(file);
  };

  const handleRestoreFromJSONContent = async () => {
    if (!importedJSON) return;
    setIsLoadingBackups(true);
    setBackupSuccessMessage('');
    setBackupErrorMessage('');
    try {
      await restoreDatabaseFromJSON(importedJSON, adminUser);
      setBackupSuccessMessage('Local database backup imported and restored successfully!');
      setShowJSONRestoreConfirm(false);
      setImportedJSON(null);
      reloadData();
    } catch (e: any) {
      console.error("Restoration from JSON failed:", e);
      setBackupErrorMessage(`Restoration failed: ${e.message || e}`);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  // Handle User Approval
  const handleApproveUser = async (targetUser: User) => {
    if (isProcessingAction) return;
    setIsProcessingAction(true);
    try {
      const approved = await approveStudentRequest(targetUser);
      setUsers(getUsers());

      // Record Activity log
      addActivityLog(
        adminUser.id,
        adminUser.fullName,
        adminUser.email,
        'Account Approval',
        `Approved student account for ${approved.fullName} (${approved.role}) from ${approved.collegeName}.`
      );

      setSelectedPendingRequest(null);
    } catch (e: any) {
      console.error(e);
      alert("Error approving user: " + (e.message || e));
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Handle User Rejection
  const handleOpenRejection = (targetUser: User) => {
    setSelectedPendingRequest(targetUser);
    setRejectionReason('');
    setShowRejectionModal(true);
  };

  const handleApproveFromInspecting = async (targetUser: User) => {
    await handleApproveUser(targetUser);
    setInspectingVerification(null);
  };

  const handleRejectFromInspecting = (targetUser: User) => {
    handleOpenRejection(targetUser);
    setInspectingVerification(null);
  };

  const handleFinalizeRejection = async () => {
    if (!selectedPendingRequest || !rejectionReason.trim() || isProcessingAction) return;
    setIsProcessingAction(true);
    try {
      await rejectStudentRequest(selectedPendingRequest.id, rejectionReason);
      setUsers(getUsers());

      // Record Activity log and push message alert
      addActivityLog(
        adminUser.id,
        adminUser.fullName,
        adminUser.email,
        'Account Rejection',
        `Rejected student account for ${selectedPendingRequest.fullName} (${selectedPendingRequest.role}). Reason: ${rejectionReason}`
      );

      sendPushNotification(
        selectedPendingRequest.id,
        'CampusRide verification rejected ❌',
        `Your verification failed: ${rejectionReason}. Please update details in your profile to request review.`,
        'system'
      );

      setShowRejectionModal(false);
      setSelectedPendingRequest(null);
    } catch (e: any) {
      console.error(e);
      alert("Error rejecting request: " + (e.message || e));
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Toggle user state: Ban / Unban / Suspend
  const handleToggleUserState = async (targetUser: User, actionType: 'suspend' | 'ban' | 'reactivate' | 'delete' | 'reject_deletion', forceConfirm = false) => {
    if (isProcessingAction) return;

    // Trigger custom confirmation modal instead of browser blocking window.confirm
    if (!forceConfirm && (actionType === 'delete' || actionType === 'ban' || actionType === 'suspend')) {
      setConfirmModal({
        isOpen: true,
        user: targetUser,
        actionType: actionType
      });
      return;
    }

    setIsProcessingAction(true);
    try {
      if (actionType === 'delete') {
        await deleteUserAccount(targetUser.id);
        addActivityLog(adminUser.id, adminUser.fullName, adminUser.email, 'User Deletion', `Permanently deleted user account: ${targetUser.fullName} (${targetUser.email})`);
      } else if (actionType === 'reject_deletion') {
        await updateUserProfile(targetUser.id, { deletionRequested: false });
        addActivityLog(adminUser.id, adminUser.fullName, adminUser.email, 'Moderation Change', `Rejected account deletion request for ${targetUser.fullName}. Profile retained.`);
        sendPushNotification(
          targetUser.id,
          'Account Deletion Request Denied',
          'Your account deletion request has been reviewed and declined by the CampusRide administration. Your profile remains active.',
          'system'
        );
      } else {
        const nextSuspended = actionType === 'suspend' ? true : actionType === 'reactivate' ? false : targetUser.isSuspended;
        const nextBanned = actionType === 'ban' ? true : actionType === 'reactivate' ? false : targetUser.isBanned;
        
        await updateUserProfile(targetUser.id, {
          isSuspended: nextSuspended,
          isBanned: nextBanned
        });

        addActivityLog(
          adminUser.id,
          adminUser.fullName,
          adminUser.email,
          'Moderation Change',
          `Changed status of ${targetUser.fullName} to: ${actionType.toUpperCase()}`
        );

        sendPushNotification(
          targetUser.id,
          `Account Status Updated`,
          `Your account status has been updated to: ${actionType === 'reactivate' ? 'ACTIVE' : actionType.toUpperCase()}. Contact support for details.`,
          'system'
        );
      }
      setUsers(getUsers());
      setViewingUser(null);
    } catch (e: any) {
      console.error(e);
      alert("Error: " + (e.message || e));
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleAdminCancelSubscription = async (userId: string, userName: string) => {
    setIsProcessingCancelSub(true);
    try {
      const res = await fetch("/api/razorpay/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(`Successfully disabled auto-renewal for ${userName}.`, "success");
        await updateUserProfile(userId, {
          subscription: data.subscription,
          subscriptionActive: true,
        });
        reloadData();
      } else {
        triggerToast(data.error || "Failed to cancel subscription.", "error");
      }
    } catch (err: any) {
      console.error("Admin cancel subscription error:", err);
      triggerToast("Failed to cancel subscription due to a network error.", "error");
    } finally {
      setIsProcessingCancelSub(false);
      setShowCancelSubConfirm(false);
      setCancelSubUser(null);
    }
  };

  // Cancel ride from dashboard
  const handleCancelRide = (rideId: string) => {
    const updatedRides = rides.map(r => {
      if (r.id === rideId) {
        return { ...r, status: 'cancelled' as const };
      }
      return r;
    });
    saveRides(updatedRides);
    setRides(updatedRides);

    const cancelledRide = rides.find(r => r.id === rideId);
    if (cancelledRide) {
      addActivityLog(
        adminUser.id,
        adminUser.fullName,
        adminUser.email,
        'Ride Cancellation',
        `Cancelled ride ${rideId} created by ${cancelledRide.riderName}`
      );
      
      // Notify rider
      sendPushNotification(
        cancelledRide.riderId,
        'Your ride has been cancelled by Admin ❗️',
        'CampusRide administration has cancelled your scheduled ride due to policy violations or safety reports.',
        'system'
      );
    }
  };

  // Complaint replies
  const handleResolveComplaint = (ticketId: string) => {
    if (!ticketResponseText.trim()) return;

    // Call central resolveComplaint function (updates Firestore & local storage)
    resolveComplaint(ticketId, ticketResponseText);

    // Update state to render immediately
    setComplaints(prev => prev.map(c => {
      if (c.id === ticketId) {
        return { 
          ...c, 
          status: 'resolved' as any, 
          adminResponse: ticketResponseText,
          dateResolved: new Date().toISOString() 
        };
      }
      return c;
    }));

    const ticket = complaints.find(c => c.id === ticketId);
    if (ticket) {
      addActivityLog(
        adminUser.id,
        adminUser.fullName,
        adminUser.email,
        'Ticket Resolution',
        `Resolved complaint ticket ${ticketId}. Sent reply.`
      );

      sendPushNotification(
        ticket.passengerId,
        'Your complaint has been resolved! ✅',
        `Admin response: "${ticketResponseText}"`,
        'complaint_update'
      );
    }

    setResponseTicketId(null);
    setTicketResponseText('');
  };

  // Save admin profile changes
  const handleSaveAdminDetails = () => {
    if (!editAdminForm.fullName.trim()) {
      alert('Full Name is required.');
      return;
    }
    if (!editAdminForm.email.trim()) {
      alert('Email address is required.');
      return;
    }
    if (!editAdminForm.phoneNumber.trim()) {
      alert('Phone number is required.');
      return;
    }

    // Update in users database list via Firestore-enabled helper
    if (viewingUser) {
      updateUserProfile(viewingUser.id, {
        fullName: editAdminForm.fullName.trim(),
        email: editAdminForm.email.trim(),
        phoneNumber: editAdminForm.phoneNumber.trim(),
        collegeName: editAdminForm.collegeName.trim(),
      });
    }

    setUsers(getUsers());

    // Update active admin user session
    const updatedAdmin = {
      ...adminUser,
      fullName: editAdminForm.fullName.trim(),
      email: editAdminForm.email.trim(),
      phoneNumber: editAdminForm.phoneNumber.trim(),
      collegeName: editAdminForm.collegeName.trim(),
    };
    localStorage.setItem('campusride_current_user', JSON.stringify(updatedAdmin));

    // Update local viewing user
    setViewingUser(updatedAdmin);
    setIsEditingAdmin(false);

    // Add activity log
    addActivityLog(
      adminUser.id,
      editAdminForm.fullName.trim(),
      editAdminForm.email.trim(),
      'Admin Settings',
      `Admin updated profile details: ${editAdminForm.fullName}`
    );

    // Sync state: fire a storage change event so that parent is aware, or do a smooth instant reload to populate everything.
    setTimeout(() => {
      window.location.reload();
    }, 150);
  };

  // Simulated live coordinates movement increment
  useEffect(() => {
    if (selectedTrackingRide) {
      const interval = setInterval(() => {
        setSimulatedProgress(p => (p >= 100 ? 5 : p + 2));
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedTrackingRide]);

  // Export to CSV helper
  const handleExportData = (dataType: 'users' | 'rides' | 'activity_logs') => {
    let headers = '';
    let rows = [];
    let filename = '';

    if (dataType === 'users') {
      headers = 'ID,Full Name,Email,Role,College,Phone,VerifiedState,CreateDate\n';
      rows = users.map(u => `"${u.id}","${u.fullName}","${u.email}","${u.role}","${u.collegeName}","${u.phoneNumber}","${u.verificationStatus}","${u.dateCreated || ''}"`);
      filename = 'CampusRide_Users_Audit_Report.csv';
    } else if (dataType === 'rides') {
      headers = 'RideID,Rider,College,Source,Destination,Price,Status\n';
      rows = rides.map(r => `"${r.id}","${r.riderName}","${r.riderCollege}","${r.pickup}","${r.destination}",${r.pricePerSeat},"${r.status}"`);
      filename = 'CampusRide_Ride_Transactions.csv';
    } else {
      headers = 'LogID,User,Email,Action,Description,Timestamp\n';
      rows = activityLogs.map(l => `"${l.id}","${l.userName}","${l.email}","${l.action}","${l.description}","${l.timestamp}"`);
      filename = 'CampusRide_Audit_Activity_Logs.csv';
    }

    const blob = new Blob([headers + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAuditReport = () => {
    // Filter out deleted and merged request records to ensure real registered and yet-to-be registered users are presented
    const listToPrint = users.filter(u => !u.isDeleted && !u.isPendingRequestMerged);
    
    const totalCount = listToPrint.length;
    const approvedCount = listToPrint.filter(u => u.verificationStatus === 'approved').length;
    const pendingCount = listToPrint.filter(u => u.verificationStatus === 'pending').length;
    const ridersCount = listToPrint.filter(u => u.role === 'rider').length;
    const passengersCount = listToPrint.filter(u => u.role === 'passenger').length;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>CampusRide Audit Users Ledger</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 1.6cm 1.2cm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              font-size: 11px;
              line-height: 1.5;
              margin: 0;
              padding: 40px;
              background-color: #f8fafc;
            }
            .paper {
              background: #ffffff;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
              max-width: 900px;
              margin: 0 auto;
              border: 1px solid #e2e8f0;
            }
            .header-container {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 20px;
            }
            .title {
              font-size: 20px;
              font-weight: 800;
              letter-spacing: -0.5px;
              text-transform: uppercase;
              color: #0f172a;
              margin: 0;
            }
            .subtitle {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #475569;
              font-weight: 600;
              margin-top: 4px;
              margin-bottom: 0;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-bottom: 24px;
            }
            .meta-card {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 10px;
              text-align: center;
            }
            .meta-card .label {
              font-size: 8px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #64748b;
              font-weight: 700;
              margin-bottom: 4px;
            }
            .meta-card .val {
              font-size: 14px;
              font-weight: 800;
              color: #0f172a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            th {
              background: #0f172a;
              color: #ffffff;
              text-align: left;
              padding: 8px 10px;
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              border: 1px solid #0f172a;
            }
            td {
              padding: 8px 10px;
              border: 1px solid #e2e8f0;
              font-size: 10px;
            }
            tr:nth-child(even) {
              background-color: #f8fafc;
            }
            .badge {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 8px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.25px;
            }
            .badge-approved {
              background-color: #dcfce7;
              color: #166534;
            }
            .badge-pending {
              background-color: #fef9c3;
              color: #854d0e;
            }
            .badge-rejected {
              background-color: #fee2e2;
              color: #991b1b;
            }
            .badge-rider {
              background-color: #e0f2fe;
              color: #0369a1;
            }
            .badge-passenger {
              background-color: #f3e8ff;
              color: #6b21a8;
            }
            .footer {
              text-align: center;
              font-size: 8px;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #94a3b8;
              font-weight: 600;
              padding-top: 15px;
              border-top: 1px solid #e2e8f0;
              margin-top: 40px;
            }
          </style>
        </head>
        <body>
          <div class="paper">
            <div class="header-container">
              <h1 class="title">CampusRide Audit Users Registry Statement</h1>
              <p class="subtitle">Official Registrar Audit Document &bull; Generated: ${new Date().toLocaleString()}</p>
            </div>

            <div class="meta-grid">
              <div class="meta-card">
                <div class="label">Total Registered Staff</div>
                <div class="val">${totalCount}</div>
              </div>
              <div class="meta-card">
                <div class="label">Approved Active</div>
                <div class="val">${approvedCount}</div>
              </div>
              <div class="meta-card">
                <div class="label">Pending Verification</div>
                <div class="val">${pendingCount}</div>
              </div>
              <div class="meta-card">
                <div class="label">Registered Riders</div>
                <div class="val">${ridersCount}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 25%;">User ID</th>
                  <th style="width: 20%;">Full Name</th>
                  <th style="width: 25%;">Email</th>
                  <th style="width: 10%;">Role</th>
                  <th style="width: 10%;">College</th>
                  <th style="width: 10%;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${listToPrint.map(u => `
                  <tr>
                    <td style="font-family: monospace; font-size: 9px; color: #475569;">${u.id}</td>
                    <td style="font-weight: 600; color: #010101;">${u.fullName}</td>
                    <td style="color: #334155;">${u.email}</td>
                    <td><span class="badge badge-${u.role}">${u.role}</span></td>
                    <td style="color: #475569;">${u.collegeName || 'N/A'}</td>
                    <td><span class="badge badge-${u.verificationStatus || 'pending'}">${u.verificationStatus || 'pending'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="footer">
              Confidential Document &bull; Internal Institutional Audit &bull; Secure Cloud Ledger Integrity
            </div>
          </div>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'CampusRide_Audit_Users_Ledger.html');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const filteredUsers = users.filter(u => {
    if (u.isPendingRequestMerged) return false;
    
    // Evaluate matching status filter
    let matchesStatus = false;
    if (statusFilter === 'all') {
      matchesStatus = true;
    } else {
      matchesStatus = u.verificationStatus === statusFilter;
    }

    const matchesSearch = u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.phoneNumber.includes(searchTerm);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesCollege = collegeFilter === 'all' || u.collegeName === collegeFilter;
    
    return matchesSearch && matchesRole && matchesCollege && matchesStatus;
  });

  const validUsersForCount = users.filter(u => {
    const isAdmin = u.isAdmin || isSystemAdminEmail(u.email);
    const isApproved = u.verificationStatus === 'approved';
    return !isAdmin && isApproved && !u.isDeleted && !u.isPendingRequestMerged;
  });

  const pendingRequests = users.filter(u => u.verificationStatus === 'pending' && !u.isDeleted && !u.isPendingRequestMerged);
  const activeRiders = validUsersForCount.filter(u => u.role === 'rider' && u.verificationStatus === 'approved');
  const passengers = validUsersForCount.filter(u => u.role === 'passenger');

  // Generate aggregate dashboard stats
  const totalRegisteredCount = validUsersForCount.length;
  const pendingRequestsCount = pendingRequests.length;
  const activeRidesCount = rides.filter(r => r.status === 'active').length;
  const completedRidesCount = rides.filter(r => r.status === 'completed').length;
  const cancelledRidesCount = rides.filter(r => r.status === 'cancelled').length;
  const outstandingComplaintsCount = complaints.filter(c => (c as any).status !== 'resolved').length;

  // College-wise count list creator
  const getCollegeDistribution = () => {
    const list: { [key: string]: number } = {};
    validUsersForCount.forEach(u => {
      list[u.collegeName] = (list[u.collegeName] || 0) + 1;
    });
    return Object.keys(list).map(name => ({ name, value: list[name] }));
  };

  // Calculate daily transit volumes and system revenue dynamically from real database transactions/bookings
  const hourlyRideData = (() => {
    const slots = [
      { time: '08:00 AM', count: 0, bookings: 0, revenue: 0 },
      { time: '10:00 AM', count: 0, bookings: 0, revenue: 0 },
      { time: '12:00 PM', count: 0, bookings: 0, revenue: 0 },
      { time: '02:00 PM', count: 0, bookings: 0, revenue: 0 },
      { time: '04:00 PM', count: 0, bookings: 0, revenue: 0 },
      { time: '06:00 PM', count: 0, bookings: 0, revenue: 0 },
      { time: '08:00 PM', count: 0, bookings: 0, revenue: 0 }
    ];

    // Distribute bookings and their verified earnings
    bookings.forEach(b => {
      const ride = rides.find(r => r.id === b.rideId);
      const timeStr = ride ? ride.departureTime : '12:00 PM';
      
      let hourNum = 12;
      let isPM = false;
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        hourNum = parseInt(match[1]);
        isPM = match[3].toUpperCase() === 'PM';
        if (hourNum === 12) {
          if (!isPM) hourNum = 0;
        } else if (isPM) {
          hourNum += 12;
        }
      } else {
        const fall = timeStr.match(/(\d+):(\d+)/);
        if (fall) {
          hourNum = parseInt(fall[1]);
        }
      }

      const targetHours = [8, 10, 12, 14, 16, 18, 20];
      let minDiff = 999;
      let closestIdx = 3; // defaults to 02:00 PM
      targetHours.forEach((th, idx) => {
        const diff = Math.abs(th - hourNum);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });

      slots[closestIdx].bookings += 1;
      
      // Calculate earnings only when there is actual paid or accepted booking earnings
      if (b.status === 'accepted' || b.paymentStatus === 'paid') {
        slots[closestIdx].revenue += b.totalPrice;
      }
    });

    // Also count actual rides created per time slot
    rides.forEach(ride => {
      const timeStr = ride.departureTime || '';
      let hourNum = 12;
      let isPM = false;
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        hourNum = parseInt(match[1]);
        isPM = match[3].toUpperCase() === 'PM';
        if (hourNum === 12) {
          if (!isPM) hourNum = 0;
        } else if (isPM) {
          hourNum += 12;
        }
      } else {
        const fall = timeStr.match(/(\d+):(\d+)/);
        if (fall) {
          hourNum = parseInt(fall[1]);
        }
      }

      const targetHours = [8, 10, 12, 14, 16, 18, 20];
      let minDiff = 999;
      let closestIdx = 3;
      targetHours.forEach((th, idx) => {
        const diff = Math.abs(th - hourNum);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });

      slots[closestIdx].count += 1;
    });

    return slots;
  })();

  const collegeColors = ['#2563EB', '#00C896', '#EAB308', '#EC4899', '#8B5CF6', '#F97316'];

  return (
    <div id="admin-main-viewport" className={`min-h-screen font-sans flex text-slate-800 dark:text-slate-100 transition-colors duration-200 ${theme === 'dark' ? 'bg-[#090D16]' : 'bg-[#F8FAFC]'}`}>
      {/* 1. Left Navigation Sidebar */}
      <aside className="w-64 bg-slate-950 text-white shrink-0 hidden md:flex flex-col border-r border-slate-850 justify-between">
        <div>
          {/* Brand header */}
          <div className="p-6 border-b border-slate-850 flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-tr from-emerald-400 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight uppercase">CampusRide</h1>
              <span className="text-[9.5px] text-emerald-400 uppercase font-mono tracking-widest font-extrabold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block"></span>
                Admin Portal
              </span>
            </div>
          </div>

          <div className="px-4 py-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-4">Command Center</span>
            
            {/* Sidebar core tabs */}
            <nav className="space-y-1">
              {[
                { id: 'overview', label: 'Monitor Overview', icon: BarChart2 },
                { id: 'approvals', label: 'Student Approvals', icon: CheckSquare, badge: pendingRequestsCount },
                { id: 'users', label: 'User Management', icon: Users },
                { id: 'riders', label: 'Riders & Vehicle Details', icon: Car },
                { id: 'rides', label: 'Rides Monitoring', icon: Compass },
                { id: 'map', label: 'Live Map Tracking', icon: MapPin },
                { id: 'feedback', label: 'Complaints Tickets', icon: MessageSquare, badge: complaints.filter(c => c.status !== 'resolved').length },
                { id: 'sessions', label: 'Session Monitoring', icon: Clock },
                { id: 'audit', label: 'Audit Activity Logs', icon: Activity },
                { id: 'reports', label: 'Reports & Analytics', icon: FileText },
                ...(onSwitchToStudentView ? [{ id: 'student_portal', label: 'Student View Portal', icon: ArrowUpRight }] : [])
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`sidebar-link-${item.id}`}
                    onClick={() => {
                      if (item.id === 'student_portal') {
                        onSwitchToStudentView();
                      } else {
                        setActiveTab(item.id as TabType);
                        setSearchTerm('');
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                      isActive 
                        ? 'bg-[#1e293b] text-emerald-400 font-extrabold shadow-sm border-l-4 border-emerald-500' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && item.badge > 0 ? (
                      <span className="bg-red-500 text-white font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Admin profile card / quit section */}
        <div className="p-4 border-t border-slate-850 bg-slate-950/80">
          <div 
            onClick={() => setViewingUser(adminUser)}
            className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-slate-900/60 p-1.5 -mx-1.5 rounded-xl transition-all duration-150 select-none group"
            title="View Admin details"
          >
            <img src={adminUser.avatarUrl} alt="Admin" className="w-8 h-8 rounded-full border border-slate-700 object-cover group-hover:scale-105 transition duration-150 shrink-0" />
            <div className="truncate flex-1">
              <span className="text-xs font-bold text-white block leading-tight group-hover:text-[#00C896] transition duration-150">{adminUser.fullName}</span>
              <span className="text-[10px] text-slate-500 block truncate font-mono">Super Admin</span>
            </div>
          </div>
          
          <button 
            onClick={onLogout}
            id="admin-logout-btn"
            className="w-full flex items-center justify-center gap-2 bg-red-650 hover:bg-red-700 text-white py-2 px-3 rounded-lg text-xs font-bold transition uppercase tracking-wider cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Quit Portal</span>
          </button>
        </div>
      </aside>

      {/* Mobile Slide-out Sidebar Drawer */}
      {isAdminSidebarOpen && (
        <div className="fixed inset-0 z-[100] md:hidden flex">
          {/* Backdrop with fade-in effect */}
          <div 
            onClick={() => setIsAdminSidebarOpen(false)}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
          />
          {/* Drawer Content with slide-in animation */}
          <aside className="relative w-64 bg-slate-950 text-white h-full flex flex-col border-r border-slate-850 justify-between z-10 font-sans shadow-2xl animate-in slide-in-from-left duration-250">
            <div>
              {/* Brand header */}
              <div className="p-6 border-b border-slate-850 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gradient-to-tr from-emerald-400 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-sm font-bold tracking-tight uppercase">CampusRide</h1>
                    <span className="text-[9.5px] text-emerald-400 uppercase font-mono tracking-widest font-extrabold flex items-center gap-1.5">
                      Admin Mobile
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAdminSidebarOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 cursor-pointer transition"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <div className="px-4 py-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-4">Command Center</span>
                
                <nav className="space-y-1">
                  {[
                    { id: 'overview', label: 'Monitor Overview', icon: BarChart2 },
                    { id: 'approvals', label: 'Student Approvals', icon: CheckSquare, badge: pendingRequestsCount },
                    { id: 'users', label: 'User Management', icon: Users },
                    { id: 'riders', label: 'Riders & Vehicle Details', icon: Car },
                    { id: 'rides', label: 'Rides Monitoring', icon: Compass },
                    { id: 'map', label: 'Live Map Tracking', icon: MapPin },
                    { id: 'feedback', label: 'Complaints Tickets', icon: MessageSquare, badge: complaints.filter(c => c.status !== 'resolved').length },
                    { id: 'sessions', label: 'Session Monitoring', icon: Clock },
                    { id: 'audit', label: 'Audit Activity Logs', icon: Activity },
                    { id: 'reports', label: 'Reports & Analytics', icon: FileText },
                    ...(onSwitchToStudentView ? [{ id: 'student_portal', label: 'Student View Portal', icon: ArrowUpRight }] : [])
                  ].map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (item.id === 'student_portal') {
                            onSwitchToStudentView?.();
                          } else {
                            setActiveTab(item.id as TabType);
                            setSearchTerm('');
                            setIsAdminSidebarOpen(false);
                          }
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                          isActive 
                            ? 'bg-[#1e293b] text-emerald-400 font-extrabold shadow-sm border-l-4 border-emerald-500' 
                            : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && item.badge > 0 ? (
                          <span className="bg-red-500 text-white font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            <div className="p-4 border-t border-slate-850 bg-slate-950/80">
              <div 
                onClick={() => {
                  setViewingUser(adminUser);
                  setIsAdminSidebarOpen(false);
                }}
                className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-slate-900/60 p-1.5 -mx-1.5 rounded-xl transition-all duration-150 select-none group"
              >
                <img src={adminUser.avatarUrl} alt="Admin" className="w-8 h-8 rounded-full border border-slate-700 object-cover shrink-0" />
                <div className="truncate flex-1">
                  <span className="text-xs font-bold text-white block leading-tight">{adminUser.fullName}</span>
                  <span className="text-[10px] text-slate-500 block truncate font-mono">Super Admin</span>
                </div>
              </div>
              
              <button 
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 bg-red-650 hover:bg-red-700 text-white py-2 px-3 rounded-lg text-xs font-bold transition uppercase tracking-wider cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Quit Portal</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 2. Main content area wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header navbar */}
        <header id="admin-navigation-header" className="min-h-[4rem] pt-safe border-b border-slate-200 dark:border-slate-850 px-4 md:px-6 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md bg-white/90 dark:bg-[#090D16]/90">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger menu toggle */}
            <button
              onClick={() => setIsAdminSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-[#00C896] hover:bg-slate-100 dark:hover:bg-slate-900 rounded-xl transition cursor-pointer"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-extrabold uppercase tracking-tight text-slate-800 dark:text-white">
              {activeTab === 'overview' && 'SYSTEM STATUS DASHBOARD'}
              {activeTab === 'approvals' && 'STUDENT VERIFICATION SYSTEM'}
              {activeTab === 'users' && 'STUDENT MEMBER DIRECTORY'}
              {activeTab === 'riders' && 'CAMPUS RIDERS DIRECTORY'}
              {activeTab === 'rides' && 'ACTIVE RIDE DEPLOYMENTS'}
              {activeTab === 'map' && 'LIVE DRIVER LOCATION MAP'}
              {activeTab === 'feedback' && 'STUDENT COMPLAINTS SERVICE'}
              {activeTab === 'sessions' && 'SECURITY LOGIN HISTORY'}
              {activeTab === 'audit' && 'AUDIT ACTIVITY TRAIL'}
              {activeTab === 'reports' && 'METRICS REPORTS'}
              {activeTab === 'backups' && 'CLOUD SNAPS & DATA SEEDING'}
            </h2>
            {isRefreshing && (
              <span className="text-[10px] font-mono text-emerald-500 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Synchronising live database...
              </span>
            )}
          </div>

          {/* Quick tools menu (Mode toggle, mobile triggers) */}
          <div className="flex items-center gap-4">
            
            {/* Quick pre-seeded indicators */}
            <div className="hidden lg:flex items-center gap-2 bg-slate-100 dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-850">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
              <span className="text-[10px] text-slate-550 dark:text-slate-400 font-mono tracking-wider">
                ACTIVE RIDES: {activeRidesCount}
              </span>
            </div>

            {onSwitchToStudentView && (
              <button 
                onClick={onSwitchToStudentView}
                className="md:hidden flex items-center justify-center p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition cursor-pointer"
                title="Student Portal Link"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>
            )}

            {/* Mobile Header indicator */}
            <button 
              onClick={onLogout}
              className="md:hidden flex items-center justify-center p-2 text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/20 rounded-xl transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Admin Dashboard Options/Navigation Sub-Navbar Menu Bar */}
        <div id="admin-sub-navbar" className="border-b border-slate-200 dark:border-slate-850 bg-slate-55/70 dark:bg-slate-950/40 px-6 py-2.5 flex items-center justify-between gap-4 overflow-x-auto scrollbar-none sticky top-16 z-20 font-sans backdrop-blur-md">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-extrabold text-slate-450 dark:text-slate-550 uppercase tracking-widest mr-2">Quick Navigation:</span>
            {[
              { id: 'overview', label: 'Overview', icon: BarChart2 },
              { id: 'approvals', label: 'Approvals', icon: CheckSquare, badge: pendingRequestsCount },
              { id: 'users', label: 'Users', icon: Users },
              { id: 'riders', label: 'Riders', icon: Car },
              { id: 'rides', label: 'Rides', icon: Compass },
              { id: 'map', label: 'Live Map', icon: MapPin },
              { id: 'feedback', label: 'Complaints', icon: MessageSquare, badge: complaints.filter(c => c.status !== 'resolved').length },
              { id: 'audit', label: 'Audit Logs', icon: Activity },
              { id: 'reports', label: 'Reports', icon: FileText },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as TabType);
                    setSearchTerm('');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10.5px] font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-150 cursor-pointer ${
                    isActive 
                      ? 'bg-[#00C896]/10 text-[#00C896] border border-[#00C896]/30 shadow-[#00C896]/5 shadow-sm' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-900/50 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="bg-red-500 text-white font-mono text-[8px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Action options menu on the right */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-extrabold text-slate-450 dark:text-slate-550 uppercase tracking-widest hidden xl:inline">Action Options:</span>
            
            {/* Quick backups button */}
            <button
              onClick={() => {
                setActiveTab('backups');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10.5px] font-bold uppercase tracking-wider cursor-pointer border ${
                activeTab === 'backups'
                  ? 'bg-blue-600/10 text-blue-400 border-blue-500/30'
                  : 'text-slate-650 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
              title="Cloud Snapshots & Seeding"
            >
              <Database className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Database backups</span>
            </button>

            {/* Export data dropdown/options */}
            <button
              onClick={() => handleExportData('activity_logs')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10.5px] font-bold uppercase tracking-wider cursor-pointer border text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-850"
              title="Download Secure Security Trail statement"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Audit</span>
            </button>
          </div>
        </div>

        {/* Tab contents panel layout */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ======================= TAB: OVERVIEW ======================= */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Aggregation summary tiles */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { title: 'Total Registered Staff', value: totalRegisteredCount, label: 'All college users', color: 'border-l-indigo-600 dark:from-indigo-950/20', icon: Users, tab: 'users' as TabType },
                  { title: 'Verification Requests', value: pendingRequestsCount, label: 'Awaiting approvals', color: 'border-l-amber-500 dark:from-amber-950/20', icon: CheckSquare, highlight: pendingRequestsCount > 0, tab: 'approvals' as TabType },
                  { title: 'Active Rides', value: activeRidesCount, label: 'Live ongoing on road', color: 'border-l-emerald-500 dark:from-emerald-950/20', icon: Car, tab: 'rides' as TabType },
                  { title: 'Completed Runs', value: completedRidesCount, label: 'Successfully archived', color: 'border-l-sky-500 dark:from-sky-950/20', icon: CheckCircle, tab: 'reports' as TabType }
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div 
                      key={i} 
                      onClick={() => stat.tab && setActiveTab(stat.tab)}
                      className={`p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 border-l-4 ${stat.color} shadow-sm backdrop-blur-md relative overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-250 transform hover:-translate-y-0.5 active:translate-y-0 select-none`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block">{stat.title}</span>
                          <span className="text-2xl font-extrabold mt-1 block dark:text-white">{stat.value}</span>
                        </div>
                        <div className={`p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 ${stat.highlight ? 'bg-amber-500/20 dark:bg-amber-500/20 border-amber-500/20' : ''}`}>
                          <Icon className={`w-4 h-4 text-slate-550 dark:text-slate-300 ${stat.highlight ? 'text-amber-500 animate-bounce' : ''}`} />
                        </div>
                      </div>
                      <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-2 block font-medium">{stat.label}</p>
                    </div>
                  );
                })}
              </div>


              {/* Real-time stats dynamic Area Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Bookings & revenue hourly chart */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm lg:col-span-2">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Transit Volume Activity (24H)</h3>
                      <p className="text-xs text-slate-500">Live booking ticks and simulated daily transit frequency</p>
                    </div>

                  </div>

                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={hourlyRideData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00C896" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#00C896" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.1} />
                        <XAxis dataKey="time" stroke="#475569" fontSize={9} />
                        <YAxis stroke="#475569" fontSize={9} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '11px', color: '#fff' }} />
                        <Area type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCount)" name="Rides Created" />
                        <Area type="monotone" dataKey="bookings" stroke="#00C896" strokeWidth={2.5} fillOpacity={1} fill="url(#colorBookings)" name="Bookings Made" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* College statistics circle share */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Campus Registries Share</h3>
                    <p className="text-xs text-slate-500">Distribution across partner institutions</p>
                  </div>

                  <div className="h-44 my-4 relative flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RePieChart>
                        <Pie
                          data={getCollegeDistribution()}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {getCollegeDistribution().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={collegeColors[index % collegeColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', fontSize: '10px', color: '#fff' }} />
                      </RePieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-x-0 text-center pointer-events-none">
                      <span className="text-xl font-extrabold block text-slate-800 dark:text-white leading-none">{totalRegisteredCount}</span>
                      <span className="text-[9px] text-slate-400 block tracking-widest font-bold mt-1">TOTAL USERS</span>
                    </div>
                  </div>

                  <div className="space-y-1 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-2.5 rounded-xl text-[10px]">
                    {getCollegeDistribution().map((item, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: collegeColors[i % collegeColors.length] }}></span>
                          <span className="text-slate-550 dark:text-slate-300 truncate font-semibold">{item.name}</span>
                        </div>
                        <span className="font-mono text-slate-450">{item.value} ({Math.round(item.value / totalRegisteredCount * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Bottom twin overview panels (Recent requests + recent activity logs) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Pending approvals teaser card */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Awaiting Verification ({pendingRequestsCount})</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Students awaiting administrator review to log in</p>
                    </div>
                    {pendingRequestsCount > 0 && (
                      <button 
                        onClick={() => setActiveTab('approvals')}
                        className="text-[10px] text-emerald-400 hover:underline uppercase tracking-wider font-extrabold flex items-center gap-1"
                      >
                        Verify Now <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {pendingRequestsCount === 0 ? (
                    <div className="py-12 border border-dashed border-slate-200 dark:border-slate-850 text-center rounded-2xl">
                      <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60 animate-pulse" />
                      <p className="text-xs font-bold text-slate-400">All Registrations Safe & Verified</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">There are no pending accounts requiring verification right now.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingRequests.slice(0, 3).map(req => (
                        <div key={req.id} className="p-3 border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-900/60 transition hover:bg-slate-500/5 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <img src={req.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-800" />
                            <div>
                              <span className="text-xs font-extrabold text-slate-800 dark:text-white block">{req.fullName}</span>
                              <span className="text-[10px] text-slate-500 block truncate">{req.collegeName}</span>
                              <span className="text-[9px] bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20 px-1.5 py-0.2 rounded-full inline-block mt-1 lowercase font-mono">
                                role: {req.role}
                              </span>
                            </div>
                          </div>
                          <button 
                            onClick={() => { setSelectedPendingRequest(req); setActiveTab('approvals'); }}
                            className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase tracking-wider font-bold hover:bg-emerald-500 hover:text-slate-950 px-3 py-1.5 rounded-lg transition"
                          >
                            Inspect
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live Activity audit log track */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Security Audit Trails</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Persistent database modifications stream</p>
                    </div>
                    <button 
                      onClick={() => setActiveTab('audit')}
                      className="text-[10px] text-emerald-400 hover:underline uppercase tracking-wider font-bold"
                    >
                      Show Full Track
                    </button>
                  </div>

                  <div className="space-y-3">
                    {activityLogs.slice(0, 4).map(act => (
                      <div key={act.id} className="p-2.5 border border-slate-100 dark:border-slate-900 bg-slate-50 dark:bg-slate-900/45 rounded-xl flex gap-3 text-xs leading-relaxed items-start">
                        <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0 mt-0.5">
                          <Activity className="w-3.5 h-3.5" />
                        </div>
                        <div className="truncate">
                          <div className="flex justify-between items-center text-[10.5px]">
                            <span className="font-extrabold dark:text-slate-200">{act.action}</span>
                            <span className="text-slate-500 font-mono font-bold text-[9px]">{new Date(act.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-[10px] text-slate-450 dark:text-slate-400 mt-0.5 truncate">{act.description}</p>
                          <span className="text-[9px] text-slate-500 font-mono tracking-wide italic block mt-0.5">by: {act.email}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Quick Directory & Operations Peek */}
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl shadow-sm p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-900">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#00C896]" /> Dynamic Student Directory Peak
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1">Real-time registered nodes, ride deployments, and bookings transaction status</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button 
                      onClick={() => setActiveTab('users')}
                      className="text-xs bg-[#00C896]/10 hover:bg-[#00C896]/20 text-[#00C896] border border-[#00C896]/20 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      Browse All Members ({users.length})
                    </button>
                    <button 
                      onClick={() => setActiveTab('rides')}
                      className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      Active Fleet ({rides.length})
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Left Column: Recent Registrants Detail list */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Recently Registered Student details</span>
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded text-slate-500 font-bold">Latest {Math.min(5, users.length)} of {users.length}</span>
                    </div>
                    
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-900 rounded-xl">
                      <table className="w-full text-left border-collapse table-auto text-xs">
                        <thead>
                          <tr className="bg-slate-50/70 dark:bg-slate-900/50 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-200 dark:border-slate-900">
                            <th className="px-3 py-2.5">User Details</th>
                            <th className="px-3 py-2.5">Institution</th>
                            <th className="px-3 py-2.5">Role</th>
                            <th className="px-3 py-2.5">Verification</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 dark:divide-slate-900/40">
                          {users.slice(0, 5).map(u => (
                            <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/20 transition">
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <img src={u.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=60'} className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-800 shrink-0" alt="" />
                                  <div className="truncate max-w-[140px]">
                                    <span className="font-extrabold text-slate-800 dark:text-slate-200 block truncate">{u.fullName}</span>
                                    <span className="text-[9.5px] text-slate-500 block truncate leading-none mt-0.5">{u.email}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 truncate max-w-[110px] text-slate-600 dark:text-slate-300 font-medium">
                                {u.collegeName || 'N/A'}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-md border ${
                                  u.role === 'rider' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                }`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md border ${
                                  u.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
                                  u.status === 'pending' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25 animate-pulse' :
                                  'bg-red-500/15 text-red-400 border-red-500/25'
                                }`}>
                                  {u.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Column: Active Booking Deployments logs */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Active Deployments & Bookings</span>
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded text-slate-500 font-bold">Latest {Math.min(5, bookings.length)} of {bookings.length}</span>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-900 rounded-xl">
                      <table className="w-full text-left border-collapse table-auto text-xs">
                        <thead>
                          <tr className="bg-slate-50/70 dark:bg-slate-900/50 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-200 dark:border-slate-900">
                            <th className="px-3 py-2.5">Booking / Trip Details</th>
                            <th className="px-3 py-2.5">Transit Route</th>
                            <th className="px-3 py-2.5">Fare Charged</th>
                            <th className="px-3 py-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 dark:divide-slate-900/40">
                          {bookings.slice(0, 5).map(b => {
                            const matchedRide = rides.find(r => r.id === b.rideId);
                            return (
                              <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/20 transition">
                                <td className="px-3 py-2.5">
                                  <div className="truncate max-w-[150px]">
                                    <span className="font-extrabold text-slate-800 dark:text-slate-200 block truncate">Passenger ID: {b.passengerId}</span>
                                    <span className="text-[9.5px] text-slate-500 block truncate mt-0.5">Booked: {b.dateBooked}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 font-medium text-slate-650 dark:text-slate-300">
                                  <span className="block truncate max-w-[135px]" title={matchedRide ? `${matchedRide.pickup || ''} → ${matchedRide.destination || ''}` : ''}>
                                    {matchedRide ? `${(matchedRide.pickup || '').split(' ')[0]} → ${(matchedRide.destination || '').split(' ')[0]}` : 'Unknown Route'}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 font-mono font-bold text-[#00C896]">
                                  ₹{b.totalPrice}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-md border ${
                                    b.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
                                    b.status === 'pending' ? 'bg-amber-500/15 text-amber-500/25 text-amber-500 animate-pulse' :
                                    b.status === 'cancelled' ? 'bg-rose-500/15 text-rose-400 border-rose-500/25' :
                                    'bg-indigo-505/15 text-indigo-400 border-indigo-500/25'
                                  }`}>
                                    {b.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          {bookings.length === 0 && (
                            <tr>
                              <td colSpan={4} className="text-center py-6 text-slate-500">
                                No booking deployment logs currently recorded.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ======================= TAB: APPROVALS ======================= */}
          {activeTab === 'approvals' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-teal-500/15 via-emerald-500/5 to-indigo-500/15 border border-emerald-500/20 p-5 rounded-2xl">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full shrink-0">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-300">Identity Guard & College Network Security Checks</h3>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      Every new registrant defaults to a <span className="font-extrabold text-[#00C896]">PENDING APPROVAL</span> status. Users are completely locked out of requesting or publishing transits until a CampusRide Administrator verifies their details and approves their student ID record.
                    </p>
                  </div>
                </div>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="p-12 border border-dashed border-slate-200 dark:border-slate-850 rounded-3xl text-center bg-white dark:bg-slate-950/40">
                  <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-80" />
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Registration Queue Clean</h4>
                  <p className="text-xs text-slate-500 mt-1">There are no outstanding student account requests pending approval.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left checklist of names */}
                  <div className="lg:col-span-1 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Requests Queue</span>
                    {pendingRequests.map(req => (
                      <button
                        key={req.id}
                        onClick={() => setSelectedPendingRequest(req)}
                        className={`w-full text-left p-3.5 border rounded-2xl block transition cursor-pointer ${
                          selectedPendingRequest?.id === req.id 
                            ? 'bg-[#1e293b] border-[#00C896] text-[#00C896] shadow-md shadow-indigo-950/40' 
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 hover:bg-slate-500/5'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img src={req.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-800" />
                          <div className="truncate">
                            <span className="text-xs font-bold text-slate-800 dark:text-white block leading-tight">{req.fullName}</span>
                            <span className="text-[10.5px] text-slate-500 block truncate">{req.collegeName}</span>
                            <span className="text-[9px] bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 font-mono uppercase font-bold text-slate-450 px-1.5 py-0.2 rounded-md inline-block mt-1">
                              {req.role}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Right inspector detail workspace */}
                  <div className="lg:col-span-2">
                    {selectedPendingRequest ? (
                      <div className="p-6 rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-md space-y-6">
                        
                        {/* Profile segment */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-850 pb-5">
                          <div className="flex items-center gap-4">
                            <img src={selectedPendingRequest.avatarUrl} alt="Selfie avatar" className="w-16 h-16 rounded-full object-cover border border-slate-200 dark:border-slate-800 shadow" />
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-extrabold dark:text-white">{selectedPendingRequest.fullName}</h4>
                                <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border ${
                                  selectedPendingRequest.role === 'rider' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                }`}>
                                  {selectedPendingRequest.role === 'rider' ? 'RIDER' : 'PASSENGER'}
                                </span>
                              </div>
                              <span className="text-xs text-slate-550 dark:text-slate-400 block mt-1">{selectedPendingRequest.collegeName}</span>
                              <span className="text-[10px] text-slate-500 font-mono block mt-0.5">Submitted: {selectedPendingRequest.dateCreated ? new Date(selectedPendingRequest.dateCreated).toLocaleString() : 'N/A'}</span>
                            </div>
                          </div>

                          {/* Instant Approve / Reject buttons */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApproveUser(selectedPendingRequest)}
                              disabled={isProcessingAction}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 uppercase tracking-wider ${
                                isProcessingAction
                                  ? 'bg-slate-300 dark:bg-slate-805 text-slate-500 cursor-not-allowed'
                                  : 'bg-[#00C896] text-[#0f172a] hover:bg-emerald-400 cursor-pointer'
                              }`}
                            >
                              {isProcessingAction ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" /> Processing...
                                </>
                              ) : (
                                <>
                                  <Check className="w-4 h-4" /> Approve Member
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleOpenRejection(selectedPendingRequest)}
                              disabled={isProcessingAction}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 uppercase tracking-wider ${
                                isProcessingAction
                                  ? 'bg-slate-300 dark:bg-slate-805 text-slate-500 cursor-not-allowed'
                                  : 'bg-red-650 hover:bg-red-700 text-white cursor-pointer'
                              }`}
                            >
                              <X className="w-4 h-4" /> Reject Request
                            </button>
                          </div>
                        </div>

                        {/* Student credentials detailed review */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl space-y-1.5 text-xs">
                            <span className="text-[9.5px] text-slate-400 uppercase font-bold tracking-wider block">College Email ID</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">{selectedPendingRequest.email}</span>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl space-y-1.5 text-xs">
                            <span className="text-[9.5px] text-slate-400 uppercase font-bold tracking-wider block">Phone Number</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block font-mono">{selectedPendingRequest.phoneNumber}</span>
                          </div>
                          <div className="p-3 bg-emerald-500/5 dark:bg-emerald-950/10 border border-emerald-500/10 dark:border-emerald-900/40 rounded-2xl space-y-1.5 text-xs">
                            <span className="text-[9.5px] text-[#00C896] uppercase font-bold tracking-wider block">Student Password</span>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 block font-mono">
                                ••••••••
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* ID Cards Viewers list */}
                        <div className="space-y-3">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Uploaded Student ID Card Verification Images</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-500 font-bold block text-center">ID Front Layout</span>
                              <div 
                                onClick={() => setInspectingVerification({ user: selectedPendingRequest, side: 'front' })}
                                className="h-44 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-inner relative group bg-black/10 cursor-pointer hover:border-slate-400 transition"
                              >
                                <img src={selectedPendingRequest.verificationDetails?.frontIdCardUrl} alt="ID card Front" className="w-full h-full object-contain transition duration-200 group-hover:scale-102" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1.5">
                                  <div className="bg-[#00C896] text-slate-950 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-lg shadow-emerald-500/10">
                                    <Eye className="w-4 h-4" /> Tap to Verify
                                  </div>
                                  <span className="text-[10px] text-slate-300 font-medium">Verify side-by-side with selfie</span>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-500 font-bold block text-center">ID Back Layout</span>
                              <div 
                                onClick={() => setInspectingVerification({ user: selectedPendingRequest, side: 'back' })}
                                className="h-44 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-inner relative group bg-black/10 cursor-pointer hover:border-slate-400 transition"
                              >
                                <img src={selectedPendingRequest.verificationDetails?.backIdCardUrl} alt="ID card Back" className="w-full h-full object-contain transition duration-200 group-hover:scale-102" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1.5">
                                  <div className="bg-[#00C896] text-slate-950 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-lg shadow-emerald-500/10">
                                    <Eye className="w-4 h-4" /> Tap to Verify
                                  </div>
                                  <span className="text-[10px] text-slate-300 font-medium">Verify side-by-side with selfie</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Vehicle details if Rider requested */}
                        {selectedPendingRequest.role === 'rider' && (
                          <div className="border-t border-slate-250 dark:border-slate-850 pt-5 space-y-3">
                            <div className="flex items-center gap-2">
                              <Car className="w-4 h-4 text-emerald-400" />
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">RIDER VEHICLE SUBMISSION DETAILS</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-3.5 rounded-2xl space-y-1 text-xs">
                                <span className="text-[9px] text-slate-550 block font-bold">VEHICLE BRAND & MODEL</span>
                                <span className="font-extrabold text-slate-800 dark:text-slate-200">{selectedPendingRequest.vehicleName || 'N/A'}</span>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-3.5 rounded-2xl space-y-1 text-xs">
                                <span className="text-[9px] text-slate-550 block font-bold">PLATE NUMBER (LICENSE)</span>
                                <span className="font-mono font-extrabold text-slate-800 dark:text-slate-200">{selectedPendingRequest.vehiclePlate || 'N/A'}</span>
                              </div>
                              <div className="h-20 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-black/20">
                                {selectedPendingRequest.vehiclePhoto ? (
                                  <img src={selectedPendingRequest.vehiclePhoto} className="w-full h-full object-cover" alt="Vehicle look" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 font-mono">No Photo Provided</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    ) : (
                      <div className="h-full py-24 border border-dashed border-slate-250 dark:border-slate-850 rounded-3xl text-center flex flex-col justify-center items-center bg-white/40 dark:bg-slate-950/20">
                        <Users className="w-10 h-10 text-slate-400 mb-2 animate-bounce" />
                        <span className="text-xs font-bold text-slate-400">Select a Pending Account</span>
                        <p className="text-[10px] text-slate-500 mt-1">Choose a student verification request from the sidebar checklist to inspect and approve.</p>
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          )}

          {/* ======================= TAB: USERS ======================= */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              
              {/* Filters header and search menu */}
              <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-850 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search name, phone, or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select 
                      value={roleFilter} 
                      onChange={(e) => setRoleFilter(e.target.value as any)}
                      className="bg-transparent text-xs text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Roles</option>
                      <option value="passenger">Passengers Only</option>
                      <option value="rider">Riders Only</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-slate-400" />
                    <select 
                      value={statusFilter} 
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="bg-transparent text-xs text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Statuses</option>
                      <option value="approved">Approved Active</option>
                      <option value="pending">Pending Review</option>
                      <option value="rejected">Rejected Only</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5">
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <select 
                      value={collegeFilter} 
                      onChange={(e) => setCollegeFilter(e.target.value)}
                      className="bg-transparent text-xs text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Colleges</option>
                      <option value="NITK Surathkal">NITK Surathkal</option>
                      <option value="Yenepoya University derlakate">Yenepoya University derlakate</option>
                      <option value="PA College deralakate">PA College deralakate</option>
                      <option value="PA College of Engineering">PA College of Engineering</option>
                      <option value="Yenepoya mangalore">Yenepoya mangalore</option>
                      <option value="Yenepoya Bangalore">Yenepoya Bangalore</option>
                      <option value="St Aloysius College">St Aloysius College</option>
                      <option value="St Agnes College">St Agnes College</option>
                      <option value="Srinivas manglore">Srinivas manglore</option>
                      <option value="NMAMIT Nitte">NMAMIT Nitte</option>
                      <option value="Shree Devi College Mangalore">Shree Devi College Mangalore</option>
                      <option value="SDM College Mangalore">SDM College Mangalore</option>
                      <option value="Shree Devi Bajpe">Shree Devi Bajpe</option>
                      <option value="S.N.S. Polytechnic Bajpe">S.N.S. Polytechnic Bajpe</option>
                    </select>
                  </div>

                  <button
                    onClick={() => handleExportData('users')}
                    className="bg-slate-50 dark:bg-[#1e293b] text-slate-700 dark:text-emerald-400 hover:text-white hover:bg-emerald-500 border border-slate-200 dark:border-[#00C896]/20 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV Report
                  </button>
                </div>
              </div>

              {/* Users list table layout */}
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 text-slate-400 border-b border-slate-100 dark:border-slate-850 font-bold uppercase tracking-widest text-[10px]">
                        <th className="p-4">Profile</th>
                        <th className="p-4">College</th>
                        <th className="p-4">Role</th>
                        <th className="p-4">Pending Requests / Approval Status</th>
                        <th className="p-4">Moderation State</th>
                        <th className="p-4">Safety Complaints</th>
                        <th className="p-4 text-right">Moderations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                      {filteredUsers.map(user => {
                        return (
                          <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <img src={user.avatarUrl} className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-800" alt="" />
                                <div>
                                  <span className="font-extrabold text-slate-900 dark:text-white block">{user.fullName} {user.isAdmin && <strong className="text-emerald-600 dark:text-emerald-400 text-[10px] ml-1">(Admin)</strong>}</span>
                                  <span className="text-[10px] text-slate-600 dark:text-slate-400 block truncate">Email: <span className="font-mono text-slate-800 dark:text-slate-300 select-all">{user.email}</span></span>
                                  <span className="text-[10px] text-slate-600 dark:text-slate-400 block font-mono font-semibold">Phone: {user.phoneNumber}</span>
                                  {user.deletionRequested && (
                                    <div className="mt-1">
                                      <span className="bg-amber-500/10 text-amber-500 text-[9px] font-extrabold uppercase tracking-wide border border-amber-500/25 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 animate-pulse">
                                        ⚠️ Deletion Requested
                                      </span>
                                    </div>
                                  )}
                                  {!(user.isAdmin || isSystemAdminEmail(user.email)) && (
                                    <div className="mt-1 text-[10px] text-slate-500 flex items-center justify-between gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 px-1.5 py-0.5 rounded-md inline-flex w-fit">
                                      <div className="flex items-center gap-1">
                                        <span className="text-slate-450 uppercase text-[8px] font-bold">Password:</span>
                                        <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">
                                          ••••••••
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-4 text-slate-750 dark:text-slate-300 font-medium">
                              {user.collegeName}
                            </td>
                            <td className="p-4">
                              <span className={`text-[9.5px] uppercase font-extrabold font-mono px-2 py-0.5 rounded-full border ${
                                (user.isAdmin || isSystemAdminEmail(user.email))
                                  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30'
                                  : user.role === 'rider'
                                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                                    : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20'
                              }`}>
                                {(user.isAdmin || isSystemAdminEmail(user.email)) ? 'admin' : user.role}
                              </span>
                            </td>
                            <td className="p-4">
                              {user.verificationStatus === 'approved' ? (
                                <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-[#00C896] text-[10px] font-bold border border-emerald-250 dark:border-emerald-500/20 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Approved Active
                                </span>
                              ) : user.verificationStatus === 'pending' ? (
                                <span className="bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 text-[10px] font-bold border border-amber-250 dark:border-amber-500/20 px-2 py-0.5 rounded-full inline-flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="w-3 h-3" /> Pending Review
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  <span className="bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 text-[10px] font-bold border border-red-250 dark:border-red-500/20 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                    <X className="w-3 h-3" /> Rejected Member
                                  </span>
                                  {user.rejectionReason && (
                                    <span className="text-[10px] text-slate-500 block italic">Reason: "{user.rejectionReason}"</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              {user.isBanned ? (
                                <span className="bg-red-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded uppercase font-mono">BANNED</span>
                              ) : user.isSuspended ? (
                                <span className="bg-amber-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded uppercase font-mono">SUSPENDED</span>
                              ) : (
                                <span className="text-slate-600 dark:text-slate-400 italic">No Restrictions</span>
                              )}
                            </td>
                            <td className="p-4 font-mono text-[10px]">
                              {(() => {
                                const filedAgainstCount = complaints.filter(c => {
                                  const r = rides.find(rd => rd.id === c.rideId);
                                  return r && r.riderId === user.id;
                                }).length;
                                const submittedCount = complaints.filter(c => c.passengerId === user.id).length;

                                if (filedAgainstCount === 0 && submittedCount === 0) {
                                  return <span className="text-slate-400 italic">None</span>;
                                }

                                return (
                                  <div className="space-y-1">
                                    {filedAgainstCount > 0 && (
                                      <div className="flex items-center gap-1 text-red-500 font-semibold dark:text-red-400">
                                        <span className="w-1 h-1 bg-red-400 rounded-full animate-ping" />
                                        <span>Against (Rider): {filedAgainstCount}</span>
                                      </div>
                                    )}
                                    {submittedCount > 0 && (
                                      <div className="text-emerald-600 font-semibold dark:text-emerald-400">
                                        <span>Filed (Pass.): {submittedCount}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                
                                <button
                                  onClick={() => setViewingUser(user)}
                                  className="p-1 px-2.5 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-300 hover:text-white hover:bg-slate-800 rounded border border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold"
                                  title="View User details"
                                >
                                  Browse Details
                                </button>

                                {user.isSuspended || user.isBanned ? (
                                  <button
                                    onClick={() => handleToggleUserState(user, 'reactivate')}
                                    className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition cursor-pointer"
                                    title="Unrestrict Member"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleToggleUserState(user, 'suspend')}
                                      className="p-1 text-amber-500 hover:bg-amber-500/10 rounded transition cursor-pointer"
                                      title="Suspend Student Account"
                                    >
                                      <Clock className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleToggleUserState(user, 'ban')}
                                      className="p-1 text-red-500 hover:bg-red-500/10 rounded transition cursor-pointer"
                                      title="Permaban Member"
                                    >
                                      <Ban className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}

                                {user.deletionRequested ? (
                                  <div className="flex items-center gap-1.5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 p-1 rounded-lg">
                                    <button
                                      onClick={() => handleToggleUserState(user, 'delete')}
                                      className="px-2 py-1 bg-red-650 hover:bg-red-700 text-white text-[9.5px] font-extrabold uppercase rounded transition cursor-pointer flex items-center gap-1"
                                      title="Approve Deletion & Delete Profile"
                                    >
                                      <CheckCircle className="w-3 h-3" /> Approve Delete
                                    </button>
                                    <button
                                      onClick={() => handleToggleUserState(user, 'reject_deletion')}
                                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-350 text-[9.5px] font-extrabold uppercase rounded transition cursor-pointer flex items-center gap-1"
                                      title="Reject Deletion & Retain Member"
                                    >
                                      <XCircle className="w-3 h-3" /> Retain Staff
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleToggleUserState(user, 'delete')}
                                    className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded transition cursor-pointer"
                                    title="Delete Account Permanently"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-slate-500 font-semibold italic">
                            No student matches the search filters. Check query spelling.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ======================= TAB: RIDERS ======================= */}
          {activeTab === 'riders' && (
            <div className="space-y-6">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Verified Campus Riders</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.filter(u => u.role === 'rider' && !u.isDeleted && !u.isPendingRequestMerged).map(rider => (
                  <div key={rider.id} className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                      {/* Rider Profile row */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <img src={rider.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-slate-800" />
                          <div>
                            <span className="text-xs font-bold text-slate-800 dark:text-white block leading-tight">{rider.fullName}</span>
                            <span className="text-[10px] text-slate-500 block truncate">{rider.collegeName}</span>
                            <span className="text-[10px] font-mono text-emerald-400 font-extrabold mt-0.5 flex items-center gap-1">
                              ★ {rider.rating.toFixed(1)} / 5.0
                            </span>
                          </div>
                        </div>

                        {/* Status tag */}
                        <span className={`text-[8.5px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                          rider.verificationStatus === 'approved' 
                            ? 'bg-emerald-500/10 text-[#00C896] border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        }`}>
                          {rider.verificationStatus || 'unverified'}
                        </span>
                      </div>

                      {/* Vehicle specs and physical photo */}
                      <div className="mt-4 bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-850 space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-500">Vehicle Brand:</span>
                          <span className="dark:text-white uppercase font-bold text-[11px]">{rider.vehicleName || 'Not Specified'}</span>
                        </div>
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-500">Plate Registration:</span>
                          <span className="dark:text-white font-mono uppercase bg-slate-200 dark:bg-slate-950 px-2 py-0.5 rounded text-[10.5px]">
                            {rider.vehiclePlate || 'Not Specified'}
                          </span>
                        </div>

                        {/* Vehicle Photo layout preview */}
                        <div className="h-28 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mt-2 relative bg-black/10">
                          <img 
                            src={rider.vehiclePhoto || 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=400&auto=format&fit=crop&q=80'} 
                            alt="Vehicle Model" 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                      </div>

                      {/* Login Credentials block */}
                      <div className="mt-3.5 p-3.5 bg-emerald-500/5 dark:bg-slate-900 border border-emerald-500/10 dark:border-slate-800 rounded-2xl text-[10.5px] space-y-1.5">
                        <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Driver Auth Access</span>
                        <div className="flex justify-between font-mono">
                          <span className="text-slate-500 font-sans">Email ID:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-bold select-all truncate">{rider.email}</span>
                        </div>
                        <div className="flex justify-between items-center font-mono">
                          <span className="text-slate-500 font-sans">Password:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-600 dark:text-emerald-400 font-black">
                              ••••••••
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Stats details */}
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl text-center border border-slate-100 dark:border-slate-850 flex flex-col justify-center">
                          <span className="text-[9px] text-slate-500 block leading-tight">Total Runs</span>
                          <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">{rider.totalRides}</span>
                        </div>
                        <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl text-center border border-slate-100 dark:border-slate-850 flex flex-col justify-center">
                          <span className="text-[9px] text-slate-500 block leading-tight">Earnings</span>
                          <span className="text-xs font-extrabold text-emerald-400 block mt-0.5">₹{rider.balance}</span>
                        </div>
                        {(() => {
                          const complaintsAgainstCount = complaints.filter(c => {
                            const r = rides.find(rd => rd.id === c.rideId);
                            return r && r.riderId === rider.id;
                          }).length;
                          return (
                            <div className={`p-2 rounded-xl text-center border flex flex-col justify-center ${
                              complaintsAgainstCount > 0 
                                ? 'bg-red-500/10 border-red-500/25 text-red-400 font-extrabold animate-pulse' 
                                : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-850 text-slate-500'
                            }`}>
                              <span className="text-[9px] block leading-tight">Complaints</span>
                              <span className="text-xs block font-bold mt-0.5">{complaintsAgainstCount}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-900 pt-3 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setViewingUser(rider)}
                        className="bg-slate-100 dark:bg-slate-900 text-slate-750 dark:text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-[10px] font-bold py-1.5 px-3 rounded-lg uppercase tracking-wider transition cursor-pointer"
                      >
                        Inspect Ledger
                      </button>

                      <div className="flex gap-1.5">
                        {rider.isSuspended ? (
                          <button
                            onClick={() => handleToggleUserState(rider, 'reactivate')}
                            className="p-1 px-2.5 bg-emerald-500 text-slate-950 font-bold uppercase text-[9px] tracking-wide rounded-md transition hover:bg-emerald-400 cursor-pointer"
                          >
                            Unsuspend
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleUserState(rider, 'suspend')}
                            className="p-1 px-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold uppercase text-[9px] tracking-wide rounded-md transition hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
                          >
                            Suspend Rider
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleUserState(rider, 'ban')}
                          className="p-1 text-red-500 hover:bg-red-500/10 rounded transition cursor-pointer"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                  </div>
                ))}
              </div>

            </div>
          )}

          {/* ======================= TAB: RIDES ======================= */}
          {activeTab === 'rides' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-4 rounded-2xl shadow-sm">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-xl">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Total System Rides</span>
                  <span className="text-base font-extrabold text-[#00C896] block font-mono">{rides.length} Published</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-xl">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Scheduled Runs Tomorrow</span>
                  <span className="text-base font-extrabold text-white block">
                    {activeRidesCount} Runs Pending
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-xl">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Daily System Bookings</span>
                  <span className="text-base font-extrabold text-[#2563EB] block">
                    {bookings.length} Bookings
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-xl">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Admins Safety Reports</span>
                  <span className="text-base font-extrabold text-red-400 block">{outstandingComplaintsCount} Outstanding</span>
                </div>
              </div>

              {/* Rides listing table */}
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 text-slate-400 border-b border-slate-100 dark:border-slate-850 font-bold uppercase tracking-widest text-[10px]">
                        <th className="p-4">Ride ID / Date</th>
                        <th className="p-4">Rider / Campus</th>
                        <th className="p-4">Transit Path</th>
                        <th className="p-4">Pricing</th>
                        <th className="p-4">State</th>
                        <th className="p-4 text-right">Moderations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                      {rides.map(ride => (
                        <tr key={ride.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition">
                          <td className="p-4 font-mono font-bold">
                            <span className="text-slate-850 dark:text-slate-300 block">{ride.id}</span>
                            <span className="text-[10px] text-slate-500 block">{new Date(ride.date).toLocaleDateString()} at {ride.departureTime}</span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2.5">
                              <img src={ride.riderAvatar} alt="" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-800 object-cover" />
                              <div>
                                <span className="font-extrabold text-slate-800 dark:text-white block">{ride.riderName}</span>
                                <span className="text-[10px] text-slate-500 block truncate">{ride.riderCollege}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                              <span className="text-[10.5px] truncate max-w-[130px] font-bold block">{ride.pickup}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-550 block shrink-0" />
                              <span className="text-[10.5px] truncate max-w-[130px] font-bold block text-emerald-400">{ride.destination}</span>
                            </div>
                            <span className="text-[9px] text-slate-500 block mt-0.5 italic">{ride.routeType.replace(/_/g, ' ')}</span>
                          </td>
                          <td className="p-4">
                            <span className="text-[#00C896] font-bold text-xs">₹{ride.pricePerSeat}</span>
                            <p className="text-[9.5px] text-slate-550 block mt-0.2">{ride.seatsAvailable} of {ride.seatsTotal} seats open</p>
                          </td>
                          <td className="p-4">
                            <span className={`text-[9.5px] uppercase font-bold font-mono px-2 py-0.5 rounded-full border ${
                              ride.status === 'completed' 
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' 
                                : ride.status === 'cancelled'
                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                : 'bg-[#00C896]/10 text-[#00C896] border-[#00C896]/20 animate-pulse'
                            }`}>
                              {ride.status}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => { setSelectedTrackingRide(ride); setActiveTab('map'); }}
                                className="p-1 px-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-[#1e293b] text-[#00C896] rounded uppercase text-[9.5px] font-bold tracking-wider transition cursor-pointer"
                              >
                                Tracking
                              </button>
                              
                              {ride.status === 'active' && (
                                <button
                                  onClick={() => handleCancelRide(ride.id)}
                                  className="p-1 px-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500 hover:text-slate-950 text-red-400 uppercase text-[9.5px] font-bold tracking-wider rounded transition cursor-pointer"
                                >
                                  Forced Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {rides.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-slate-500 font-semibold italic">
                            There are currently no scheduled transits in our database log.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ======================= TAB: MAP ======================= */}
          {activeTab === 'map' && (
            <div className="space-y-6">
              
              <div className="bg-white dark:bg-slate-950 border border-slate-255 dark:border-slate-850 p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Live Location Tracker & Active Routes Engine</h3>
                  <p className="text-xs text-slate-500">Coordinate mapping for ongoing student rides on CampusRide networks</p>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-222 dark:border-slate-800 rounded-xl px-4 py-2">
                  <span className="text-xs text-slate-400">Selected Driver Run:</span>
                  <select 
                    value={selectedTrackingRide?.id || ''} 
                    onChange={(e) => {
                      const matched = rides.find(r => r.id === e.target.value);
                      setSelectedTrackingRide(matched || null);
                      setSimulatedProgress(45);
                    }}
                    className="bg-transparent text-xs font-extrabold text-[#00C896] focus:outline-none cursor-pointer uppercase tracking-wide"
                  >
                    <option value="">-- Choose active ride run --</option>
                    {rides.filter(r => r.status === 'active').map(r => (
                      <option key={r.id} value={r.id}>{r.riderName} to {r.destination}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedTrackingRide ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left stats detail card */}
                  <div className="lg:col-span-1 p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-900 pb-4">
                      <img src={selectedTrackingRide.riderAvatar} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-850" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-white block leading-tight">{selectedTrackingRide.riderName}</span>
                        <span className="text-[10px] text-slate-550 block font-mono">{selectedTrackingRide.vehicleName} (Plate: {selectedTrackingRide.vehiclePlate})</span>
                        <span className="text-[10px] text-slate-450 block">{selectedTrackingRide.riderCollege}</span>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-900/60 pb-2.5">
                        <span className="text-slate-500 font-medium">Pickup Landmark</span>
                        <span className="dark:text-white font-extrabold">{selectedTrackingRide.pickup}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-900/60 pb-2.5">
                        <span className="text-slate-500 font-medium">Destination College</span>
                        <span className="text-emerald-400 font-extrabold">{selectedTrackingRide.destination}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-900/60 pb-2.5">
                        <span className="text-slate-500 font-medium">Seat Inquiries</span>
                        <span className="dark:text-white font-bold">{selectedTrackingRide.seatsAvailable} available / {selectedTrackingRide.seatsTotal} total</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-medium">Ride Stream Status</span>
                        <span className="bg-emerald-500/15 text-[#00C896] text-[10px] font-extrabold tracking-wider uppercase font-mono px-2 py-0.5 rounded-full border border-emerald-500/10 animate-pulse">
                          LIVE ON ROAD ({simulatedProgress}%)
                        </span>
                      </div>
                    </div>

                    {/* Simulation logs feed */}
                    <div className="p-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 rounded-xl space-y-1.5 font-mono text-[9px] text-slate-500">
                      <span className="text-emerald-400 font-extrabold block">GPS SENSOR TELEMETRY LOOP:</span>
                      <p>● Ping: 28ms &bull; Heading: 312° N &bull; Speed: 42 km/h</p>
                      <p>● Current GPS: [12.9248° N, 74.8562° E]</p>
                      <p>● Path calculated via Google Maps platform. Standard alignment.</p>
                    </div>
                  </div>

                  {/* Right simulated routes maps canvas */}
                  <div className="lg:col-span-2">
                    <InteractiveMap
                      pickupName={selectedTrackingRide.pickup}
                      destinationName={selectedTrackingRide.destination}
                      showApproachSimulation={true}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-20 border border-dashed border-slate-200 dark:border-slate-850 rounded-3xl bg-white dark:bg-slate-950/20 text-center">
                  <MapPin className="w-12 h-12 text-slate-450 mx-auto mb-3 opacity-60 animate-bounce" />
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">MAP WORKSPACE OFFLINE</h4>
                  <p className="text-xs text-slate-500 mt-1">Please select an active rider run from the header dropdown menu to load coordinate maps.</p>
                </div>
              )}

            </div>
          )}

          {/* ======================= TAB: COMPLAINTS/FEEDBACK ======================= */}
          {activeTab === 'feedback' && (
            <div className="space-y-6">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Student Complaints & Support Tickets ({complaints.filter(c => c.status !== 'resolved').length} Outstanding)</span>
              
              {complaints.length === 0 ? (
                <div className="p-16 border border-dashed border-slate-250 dark:border-slate-850 rounded-3xl bg-white dark:bg-slate-950/20 text-center">
                  <MessageSquare className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-60 animate-pulse" />
                  <h4 className="text-sm font-bold text-slate-400">No Student Tickets Active</h4>
                  <p className="text-xs text-slate-550 mt-1">Students have not filed any grievances or support requests today.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {complaints.map(ticket => {
                    const passenger = users.find(u => u.id === ticket.passengerId);
                    const rideRecord = rides.find(r => r.id === ticket.rideId);
                    const isTicketResolved = (ticket as any).status === 'resolved';

                    return (
                      <div key={ticket.id} className="p-5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl shadow-sm space-y-4">
                        
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-900 pb-3">
                          <div className="flex items-center gap-3">
                            <span className="bg-red-500/10 text-red-400 text-[10px] border border-red-500/20 font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">
                              Grievance: {ticket.category.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">Filed on: {new Date(ticket.date).toLocaleDateString()}</span>
                          </div>

                          <span className={`text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded border ${
                            isTicketResolved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-650/10 text-red-400 border-red-650/20 animate-pulse'
                          }`}>
                            {isTicketResolved ? 'Resolved' : 'Active Open'}
                          </span>
                        </div>

                        {/* Complaint and submitter info */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
                          
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Complainant Passenger</span>
                            <div className="flex items-center gap-2">
                              {passenger?.avatarUrl && <img src={passenger.avatarUrl} alt="" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-800 object-cover" />}
                              <div>
                                <span className="font-extrabold block text-slate-800 dark:text-slate-100">{passenger?.fullName || 'Student Passenger'}</span>
                                <span className="text-[10.5px] text-slate-500 block leading-tight">{passenger?.collegeName}</span>
                                {(() => {
                                  const passengerComplaintsCount = complaints.filter(c => c.passengerId === ticket.passengerId).length;
                                  return (
                                    <span className="text-[10px] text-emerald-500 font-bold block mt-1">
                                      💼 Total Submitted: {passengerComplaintsCount}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1 block">
                            <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Associated Ride Ref</span>
                            <div>
                              <span className="font-mono font-bold dark:text-slate-300 block">{ticket.rideId}</span>
                              <span className="text-[10px] text-slate-505 block font-semibold text-slate-400">Created by: {rideRecord?.riderName || 'Unknown Rider'}</span>
                              {(() => {
                                const rId = rideRecord?.riderId;
                                const riderComplaintsCount = rId ? complaints.filter(c => {
                                  const r = rides.find(rd => rd.id === c.rideId);
                                  return r && r.riderId === rId;
                                }).length : 0;
                                return (
                                  <span className={`text-[10px] font-bold block mt-1.5 ${riderComplaintsCount > 0 ? 'text-red-400 animate-pulse' : 'text-slate-500'}`}>
                                    ⚠️ Complaints Against Rider: {riderComplaintsCount}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-550 block uppercase font-bold tracking-wider">Complaint Description</span>
                            <p className="text-slate-650 dark:text-slate-350 italic">"{ticket.explanation}"</p>
                          </div>

                        </div>

                        {/* Admin replies editor */}
                        {isTicketResolved ? (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1 text-xs">
                            <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest block">Admin Resolution Decision</span>
                            <p className="dark:text-slate-200 font-medium">"{ (ticket as any).adminResponse }"</p>
                            <span className="text-[9.5px] text-slate-450 block italic">Marked resolved on: { (ticket as any).dateResolved ? new Date((ticket as any).dateResolved).toLocaleString() : 'N/A' }</span>
                          </div>
                        ) : (
                          <div className="border-t border-slate-100 dark:border-slate-900 pt-3.5 space-y-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[9.5px] text-slate-450 font-bold uppercase tracking-wider block">Submit Verification Reply & Resolve Complaint</span>
                            </div>
                            
                            {responseTicketId === ticket.id ? (
                              <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                  type="text"
                                  value={ticketResponseText}
                                  onChange={(e) => setTicketResponseText(e.target.value)}
                                  placeholder="Type formal resolution or warning description..."
                                  className="flex-1 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleResolveComplaint(ticket.id)}
                                    className="bg-emerald-550 hover:bg-emerald-500 text-slate-950 px-4 py-2 text-xs font-bold rounded-xl uppercase tracking-wider transition cursor-pointer"
                                  >
                                    Send Resolves
                                  </button>
                                  <button
                                    onClick={() => setResponseTicketId(null)}
                                    className="bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-white px-3 py-2 text-xs font-semibold rounded-xl transition"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setResponseTicketId(ticket.id); setTicketResponseText(''); }}
                                className="bg-[#00C896]/10 hover:bg-[#00C896] text-[#00C896] hover:text-[#0f172a] border border-[#00C896]/20 py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer inline-block"
                              >
                                Draft Resolution Reply
                              </button>
                            )}

                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}

          {/* ======================= TAB: SESSIONS MONITORING ======================= */}
          {activeTab === 'sessions' && (
            <div className="space-y-6">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Active Student Sign-in & Login Histories</span>
              
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 text-slate-400 border-b border-slate-100 dark:border-slate-850 font-bold uppercase tracking-widest text-[10px]">
                        <th className="p-4">Log ID</th>
                        <th className="p-4">Full Student Name</th>
                        <th className="p-4">Email ID</th>
                        <th className="p-4">Device Agent</th>
                        <th className="p-4">IP Address</th>
                        <th className="p-4">Sign-in Time</th>
                        <th className="p-4">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-900 font-mono text-[10.5px]">
                      {loginLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition">
                          <td className="p-4 text-slate-500 font-bold">{log.id}</td>
                          <td className="p-4 text-slate-800 dark:text-slate-200 font-sans font-bold">{log.userName}</td>
                          <td className="p-4 text-slate-500">{log.email}</td>
                          <td className="p-4 text-xs font-sans text-slate-600 dark:text-slate-400">{log.deviceType}</td>
                          <td className="p-4 text-emerald-400 font-semibold">{log.ipAddress}</td>
                          <td className="p-4 text-slate-550">{new Date(log.loginTime).toLocaleString()}</td>
                          <td className="p-4 font-sans font-extrabold text-[#00C896]">{log.sessionDurationStr || 'Ongoing'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ======================= TAB: AUDIT LOGS ======================= */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest block">CampusRide Audited Transactions & Activity Logs</h3>
                  <p className="text-xs text-slate-550">Audit log database are read-only and secured against deletion. Traceability active.</p>
                </div>

                <button 
                  onClick={() => handleExportData('activity_logs')}
                  className="bg-emerald-550 text-slate-950 hover:bg-emerald-400 px-4 py-2 font-bold uppercase text-xs tracking-wider rounded-xl transition flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Export Complete Audit Trail
                </button>
              </div>

              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 text-slate-400 border-b border-slate-100 dark:border-slate-850 font-bold uppercase tracking-widest text-[10px]">
                        <th className="p-4">Action Token</th>
                        <th className="p-4">Audited Event Category</th>
                        <th className="p-4">Detailed Description</th>
                        <th className="p-4">Operator Member</th>
                        <th className="p-4">Email ID</th>
                        <th className="p-4">Date & Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-900 font-mono text-[10.5px]">
                      {activityLogs.map(act => (
                        <tr key={act.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition">
                          <td className="p-4 text-slate-500 font-bold">{act.id}</td>
                          <td className="p-4">
                            <span className="p-1 px-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded font-sans text-[9.5px] uppercase font-extrabold tracking-wide">
                              {act.action}
                            </span>
                          </td>
                          <td className="p-4 text-slate-800 dark:text-slate-200 font-sans tracking-wide leading-relaxed font-medium">{act.description}</td>
                          <td className="p-4 text-slate-550 font-sans font-bold">{act.userName}</td>
                          <td className="p-4 text-slate-500">{act.email}</td>
                          <td className="p-4 text-slate-550">{new Date(act.timestamp).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ======================= TAB: REPORTS ======================= */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* PDF generation report card */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm space-y-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Audit Users Ledger HTML Report</h4>
                    <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">
                      Downloads complete, styled registration history ledgers, student profiles, colleges distributions and verification statuses ready for audit filing.
                    </p>
                  </div>
                  <button 
                    onClick={handleDownloadAuditReport}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
                  >
                    Export Audit Document
                  </button>
                </div>

                {/* Riders earnings CSV */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm space-y-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest block">College Transit Transactions</h4>
                    <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">
                      Compiles passenger bookings histories, rider service price margins, payment UPI hashes, and status receipts in deep-formatted CSV sheets.
                    </p>
                  </div>
                  <button 
                    onClick={() => handleExportData('rides')}
                    className="w-full py-2.5 bg-[#00C896] hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
                  >
                    Export Rides Ledger CSV
                  </button>
                </div>

                {/* Audit trail export excel */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm space-y-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/20 flex items-center justify-center">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Audit Activity Trails Excel</h4>
                    <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">
                      Downloads complete security transaction logs tracking logins, account verification approvals, and moderation warnings for institutional security reviews.
                    </p>
                  </div>
                  <button 
                    onClick={() => handleExportData('activity_logs')}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
                  >
                    Export Security Log CSV
                  </button>
                </div>

              </div>

              {/* Aggregation statistics chart */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-222 dark:border-slate-850 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Daily System Transit Revenue (INR)</h3>
                  <p className="text-xs text-slate-500">Hourly earnings distributed across transit bookings</p>
                </div>

                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyRideData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.1} />
                      <XAxis dataKey="time" stroke="#475569" fontSize={9} />
                      <YAxis stroke="#475569" fontSize={9} />
                      <Tooltip formatter={(value) => [`₹${value}`, 'Revenue']} contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }} />
                      <Bar dataKey="revenue" fill="#00C896" radius={[4, 4, 0, 0]} name="INR Yields" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}

          {/* ======================= TAB: BACKUPS & SYSTEM RESTORE ======================= */}
          {activeTab === 'backups' && (
            <div className="space-y-6">
              
              {/* Backups Status Messages */}
              {backupSuccessMessage && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[#00C896] text-xs font-mono flex items-center justify-between">
                  <span>{backupSuccessMessage}</span>
                  <button onClick={() => setBackupSuccessMessage('')} className="text-white hover:text-emerald-400 font-bold px-2 py-1">✕</button>
                </div>
              )}
              {backupErrorMessage && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono flex items-center justify-between">
                  <span>{backupErrorMessage}</span>
                  <button onClick={() => setBackupErrorMessage('')} className="text-white hover:text-red-400 font-bold px-2 py-1">✕</button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. Factory Reset / Clear Database Card */}
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-950 border border-red-200 dark:border-red-950/30 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-red-500/15 text-red-500 border border-red-500/20 flex items-center justify-center">
                    <Trash2 className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">Factory Wipe & Reset</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Deletes all registered passengers, riders, rides, bookings, payments, and logs. This completely wipes all active records from the app and the live database. Retains only primary admin logins.
                    </p>
                  </div>
                  <button
                    onClick={handleClearAllData}
                    disabled={isWiping}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Trash2 className={`w-4 h-4 ${isWiping ? 'animate-pulse' : ''}`} />
                    <span>{isWiping ? 'Wiping Database...' : 'Wipe & Reset Database'}</span>
                  </button>
                </div>

                {/* 2. Cloud Backup Form Card */}
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/20 flex items-center justify-center">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">Create Safe Snapshot</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Saves an encrypted, durable cloud backup snapshot of all users, rides, bookings, and payments directly into Cloud Firestore.
                    </p>
                  </div>
                  <form onSubmit={handleCreateBackup} className="space-y-3">
                    <input
                      type="text"
                      placeholder="Backup name (e.g. Karnataka Initial V1)"
                      value={newBackupName}
                      onChange={(e) => setNewBackupName(e.target.value)}
                      className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white outline-none focus:border-blue-500/50"
                    />
                    <button
                      type="submit"
                      disabled={isLoadingBackups}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isLoadingBackups ? 'Saving snapshot...' : 'Snapshot to Firestore Cloud'}
                    </button>
                  </form>
                </div>

                {/* 3. Offline JSON Export/Import Card */}
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/15 text-purple-450 border border-purple-500/20 flex items-center justify-center">
                    <Download className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">Offline JSON Backup</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Download a raw database JSON ledger to your local computer, or upload a previously saved JSON file to restore the database.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadLocalBackupJSON}
                      className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export JSON</span>
                    </button>
                    <label className="flex-1 py-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 text-slate-650 dark:text-slate-300 hover:text-white hover:bg-slate-800 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 text-center">
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <span>Import JSON</span>
                    </label>
                  </div>
                </div>

              </div>

              {/* Cloud Snapshots List Grid */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">Durable Firestore Cloud Backups</h3>
                    <p className="text-xs text-slate-500 mt-1">Real-time snapshots of systems state recorded securely</p>
                  </div>
                  <button 
                    onClick={loadCloudBackupsList}
                    disabled={isLoadingBackups}
                    className="p-2 text-slate-400 hover:text-white bg-slate-900 rounded-xl border border-slate-850 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingBackups ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {isLoadingBackups && cloudBackups.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-500" />
                    <span>Fetching cloud registry files...</span>
                  </div>
                ) : cloudBackups.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                    <span>No active cloud snapshots on Firestore. Create one above!</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-850 text-slate-500 font-bold uppercase">
                          <th className="py-3 font-bold">Snapshot Name</th>
                          <th className="py-3 font-bold">Created By</th>
                          <th className="py-3 font-bold">Timestamp</th>
                          <th className="py-3 text-right font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {cloudBackups.map((snap) => (
                          <tr key={snap.id} className="hover:bg-slate-900/40">
                            <td className="py-3.5 font-bold text-white">{snap.backupName}</td>
                            <td className="py-3.5 text-slate-400 font-mono">{snap.createdByName}</td>
                            <td className="py-3.5 text-slate-400 font-mono">{new Date(snap.backupTimestamp).toLocaleString()}</td>
                            <td className="py-3.5 text-right space-x-2">
                              <button
                                onClick={() => handleRestoreFromCloud(snap)}
                                className="px-3 py-1.5 bg-emerald-550/15 text-[#00C896] hover:bg-[#00C896] hover:text-slate-950 font-bold uppercase rounded-lg text-[10px] cursor-pointer transition-all"
                              >
                                Restore
                              </button>
                              <button
                                onClick={() => handleDeleteBackup(snap.id)}
                                className="px-3 py-1.5 bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white font-bold uppercase rounded-lg text-[10px] cursor-pointer transition-all"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}



        </main>
      </div>

      {/* ======================= SYSTEM DIALOG: INSPECT MEMBER PROFILE ======================= */}
      {viewingUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-850 p-6 rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-6 text-white relative">
            <button 
              onClick={() => setViewingUser(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 border-b border-slate-850 pb-5">
              <img src={viewingUser.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-slate-700 shadow" />
              <div>
                <h3 className="text-base font-extrabold flex items-center gap-2">
                  {viewingUser.fullName}
                  {viewingUser.isAdmin && <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20 px-2 py-0.2 rounded">admin</span>}
                </h3>
                <span className="text-xs text-slate-400 block mt-1">{viewingUser.collegeName}</span>
                <span className="text-[10px] text-slate-500 font-mono block">Registered since: {viewingUser.dateCreated ? new Date(viewingUser.dateCreated).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>

            {/* Profile specifications */}
            <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
              {viewingUser.isAdmin || viewingUser.id === adminUser.id || isSystemAdminEmail(viewingUser.email) ? (
                <>
                  <div className="bg-slate-900 border border-slate-850 p-3 rounded-xl">
                    <span className="text-[9px] text-[#00C896] block uppercase font-bold">Full Name</span>
                    {isEditingAdmin ? (
                      <input
                        type="text"
                        value={editAdminForm.fullName}
                        onChange={(e) => setEditAdminForm({ ...editAdminForm, fullName: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 block w-full mt-1.5 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                        placeholder="Admin Name"
                        required
                      />
                    ) : (
                      <span className="text-slate-100 block font-extrabold text-sm mt-1">{viewingUser.fullName}</span>
                    )}
                  </div>

                  <div className="bg-slate-900 border border-slate-850 p-3 rounded-xl">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">College / Organization</span>
                    {isEditingAdmin ? (
                      <input
                        type="text"
                        value={editAdminForm.collegeName}
                        onChange={(e) => setEditAdminForm({ ...editAdminForm, collegeName: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 block w-full mt-1.5 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                        placeholder="College/Org Name"
                      />
                    ) : (
                      <span className="text-slate-200 block font-medium mt-1">{viewingUser.collegeName || 'N/A'}</span>
                    )}
                  </div>

                  <div className="bg-slate-900 border border-slate-850 p-3 rounded-xl">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">College Registered Verified Domain</span>
                    {isEditingAdmin ? (
                      <input
                        type="email"
                        value={editAdminForm.email}
                        onChange={(e) => setEditAdminForm({ ...editAdminForm, email: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 block w-full mt-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500"
                        placeholder="Email ID"
                        required
                      />
                    ) : (
                      <span className="text-slate-200 block truncate font-mono mt-1">{viewingUser.email}</span>
                    )}
                  </div>

                  <div className="bg-slate-900 border border-slate-850 p-3 rounded-xl">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">Contact Mobile Phone</span>
                    {isEditingAdmin ? (
                      <input
                        type="text"
                        value={editAdminForm.phoneNumber}
                        onChange={(e) => setEditAdminForm({ ...editAdminForm, phoneNumber: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 block w-full mt-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500"
                        placeholder="Phone Number"
                        required
                      />
                    ) : (
                      <span className="text-slate-200 block font-mono mt-1">{viewingUser.phoneNumber}</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-slate-900 border border-slate-850 p-3 rounded-xl">
                    <span className="text-[9px] text-slate-500 block uppercase font-bold">College Registered Verified Domain</span>
                    <span className="text-slate-200 block truncate font-mono mt-0.5">{viewingUser.email}</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-850 p-3 rounded-xl">
                    <span className="text-[9px] text-slate-550 block uppercase font-bold">Contact Mobile Phone</span>
                    <span className="text-slate-200 block font-mono mt-0.5">{viewingUser.phoneNumber}</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-850 p-3 rounded-xl col-span-2">
                    <span className="text-[9px] text-slate-550 block uppercase font-bold">Audit Registration status</span>
                    <span className={`text-[10px] font-bold uppercase block mt-1 ${viewingUser.verificationStatus === 'approved' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {viewingUser.verificationStatus || 'pending'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Account Password Credentials and Login Info segment */}
            <div className="p-4 bg-slate-900/40 border border-slate-850 rounded-2xl space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">ACCOUNT LOGIN CREDENTIALS</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-relaxed">
                <div>
                  <span className="text-slate-500 block">Registered Email (Login ID):</span>
                  <span className="font-mono font-bold text-slate-200 select-all block mt-0.5">{viewingUser.email}</span>
                </div>
                {!(viewingUser.isAdmin || isSystemAdminEmail(viewingUser.email)) && (
                  <div>
                    <span className="text-slate-500 block text-emerald-500/95 font-bold">Account Sign-in Password:</span>
                    {passwordChangeUserId === viewingUser.id ? (
                      <div className="mt-1 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Enter new password"
                            value={adminNewPassword}
                            onChange={(e) => setAdminNewPassword(e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-100 text-xs font-mono focus:outline-none focus:border-emerald-500 w-full"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpdateUserPassword(viewingUser.id, viewingUser.email)}
                            disabled={isUpdatingPassword}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-2.5 py-1 rounded font-bold transition disabled:opacity-50"
                          >
                            {isUpdatingPassword ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => {
                              setPasswordChangeUserId(null);
                              setAdminNewPassword('');
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] px-2.5 py-1 rounded font-bold transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono font-extrabold text-emerald-400 block truncate">
                          ••••••••
                        </span>
                        <button
                          onClick={() => {
                            setPasswordChangeUserId(viewingUser.id);
                            setAdminNewPassword('');
                          }}
                          className="ml-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-emerald-400 px-2.5 py-0.5 rounded font-medium transition cursor-pointer"
                          title="Set a new password for this user"
                        >
                          Change
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Vehicle configuration if driver */}
            {viewingUser.role === 'rider' && (
              <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-2xl space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">VEHICLE DETAILS LEDGER</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">Vehicle:</span>
                    <span className="font-bold dark:text-white mt-0.2 block">{viewingUser.vehicleName || 'Not Specified'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Plate License:</span>
                    <span className="font-mono font-bold dark:text-white mt-0.2 block uppercase">{viewingUser.vehiclePlate || 'Not Specified'}</span>
                  </div>
                </div>
                {viewingUser.vehiclePhoto && (
                  <div className="h-32 rounded-xl overflow-hidden border border-slate-800 bg-black/25">
                    <img src={viewingUser.vehiclePhoto} className="w-full h-full object-cover" alt="Vehicle Layout" />
                  </div>
                )}
              </div>
            )}

            {/* Verification IDs images */}
            {viewingUser.verificationDetails && (
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Student ID verification file photos</span>
                <div className="grid grid-cols-2 gap-3">
                  <div 
                    onClick={() => setInspectingVerification({ user: viewingUser, side: 'front' })}
                    className="h-24 bg-black/30 border border-slate-850 rounded-xl overflow-hidden cursor-pointer hover:border-slate-400 transition relative group"
                  >
                    <img src={viewingUser.verificationDetails.frontIdCardUrl} className="w-full h-full object-contain transition duration-200 group-hover:scale-102" alt="" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1">
                      <Eye className="w-3.5 h-3.5 text-[#00C896]" />
                      <span className="text-[9px] text-slate-200 font-bold tracking-wide uppercase">Inspect Front</span>
                    </div>
                  </div>
                  <div 
                    onClick={() => setInspectingVerification({ user: viewingUser, side: 'back' })}
                    className="h-24 bg-black/30 border border-slate-850 rounded-xl overflow-hidden cursor-pointer hover:border-slate-400 transition relative group"
                  >
                    <img src={viewingUser.verificationDetails.backIdCardUrl} className="w-full h-full object-contain transition duration-200 group-hover:scale-102" alt="" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1">
                      <Eye className="w-3.5 h-3.5 text-[#00C896]" />
                      <span className="text-[9px] text-slate-200 font-bold tracking-wide uppercase">Inspect Back</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Safety Complaints Summary segment */}
            {!(viewingUser.isAdmin || isSystemAdminEmail(viewingUser.email)) && (
              <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-2xl space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">SAFETY COMPLAINTS HISTORY</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-950 border border-slate-850 p-2.5 rounded-xl space-y-1">
                    <span className="text-[9px] text-red-400 block uppercase font-bold">As Rider/Driver (Targets)</span>
                    <span className="font-extrabold text-sm block">
                      {complaints.filter(c => {
                        const r = rides.find(rd => rd.id === c.rideId);
                        return r && r.riderId === viewingUser.id;
                      }).length} Complaints Filed Against Rider
                    </span>
                  </div>
                  <div className="bg-slate-950 border border-slate-850 p-2.5 rounded-xl space-y-1">
                    <span className="text-[9px] text-emerald-400 block uppercase font-bold">As Passenger (Complainant)</span>
                    <span className="font-extrabold text-sm block">
                      {complaints.filter(c => c.passengerId === viewingUser.id).length} Complaints Submitted
                    </span>
                  </div>
                </div>

                {/* List of related complaints for details inspection */}
                {(() => {
                  const riderComps = complaints.filter(c => {
                    const r = rides.find(rd => rd.id === c.rideId);
                    return r && r.riderId === viewingUser.id;
                  });
                  const passengerComps = complaints.filter(c => c.passengerId === viewingUser.id);
                  const relatedComps = [...riderComps, ...passengerComps];

                  return relatedComps.length > 0 ? (
                    <div className="pt-2">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Grievance Ticket Logs:</span>
                      <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 font-sans text-[11px] leading-relaxed">
                        {relatedComps.map(c => {
                          const isRiderRole = riderComps.includes(c);
                          return (
                            <div key={c.id} className="p-2 rounded bg-slate-950/40 border border-slate-850 flex items-center justify-between gap-2">
                              <div>
                                <span className={`font-mono text-[9px] uppercase px-1 rounded mr-2 ${isRiderRole ? 'bg-red-500/10 text-red-400 border border-red-500/10' : 'bg-blue-500/10 text-blue-400 border border-blue-500/10'}`}>
                                  {isRiderRole ? 'Target (Rider)' : 'Creator (Passenger)'}
                                </span>
                                <span className="font-bold text-slate-300">{c.category.replace(/_/g, ' ')}</span>
                                <span className="text-slate-500 text-[10px] ml-1">({new Date(c.date).toLocaleDateString()})</span>
                              </div>
                              <span className={`text-[9.5px] font-bold px-1 rounded ${c.status === 'resolved' ? 'text-emerald-400 bg-emerald-500/5' : 'text-amber-400 bg-amber-500/5'}`}>
                                {c.status === 'resolved' ? 'Resolved' : 'Pending'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 italic">No historical complaints registered with this identity.</p>
                  );
                })()}
              </div>
            )}

            {/* Warning warning mod controls / Self Admin Check */}
            {viewingUser.id === adminUser.id || viewingUser.isAdmin || isSystemAdminEmail(viewingUser.email) ? (
              <div className="border-t border-slate-850 pt-5 flex flex-col items-center gap-4">
                {isEditingAdmin ? (
                  <div className="flex gap-3 justify-center w-full">
                    <button
                      onClick={handleSaveAdminDetails}
                      className="bg-[#00C896] hover:bg-emerald-400 text-slate-950 font-extrabold uppercase text-[11px] tracking-wider px-6 py-2.5 rounded-xl transition cursor-pointer select-none"
                    >
                      Save Configuration
                    </button>
                    <button
                      onClick={() => setIsEditingAdmin(false)}
                      className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold uppercase text-[11px] tracking-wider px-6 py-2.5 rounded-xl transition cursor-pointer select-none"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingAdmin(true)}
                    className="bg-[#00C896] hover:bg-emerald-400 text-slate-950 font-extrabold uppercase text-[11px] tracking-wider px-8 py-2.5 rounded-xl transition cursor-pointer shadow-lg shadow-emerald-500/10 select-none"
                  >
                    Edit Profile Details
                  </button>
                )}

                <div className="text-center pt-2">
                  <span className="inline-block bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] tracking-widest uppercase font-bold font-mono px-3 py-1.5 rounded-full animate-pulse">
                    System Authorized Super Admin
                  </span>
                  <p className="text-[10.5px] text-slate-450 mt-2 font-sans italic">
                    This account has unrestricted global administrative access. Moderation actions are bypass protected.
                  </p>
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-850 pt-5 flex flex-wrap gap-2.5 justify-end">
                {viewingUser.isSuspended || viewingUser.isBanned ? (
                  <button
                    onClick={() => handleToggleUserState(viewingUser, 'reactivate')}
                    className="bg-emerald-550 text-slate-950 hover:bg-emerald-400 px-4 py-2 font-bold uppercase text-[10px] tracking-wide rounded-xl transition cursor-pointer"
                  >
                    Clear Account Restrictions
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleToggleUserState(viewingUser, 'suspend')}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 font-bold uppercase text-[10px] tracking-wide rounded-xl transition cursor-pointer"
                    >
                      Suspend Student
                    </button>
                    <button
                      onClick={() => handleToggleUserState(viewingUser, 'ban')}
                      className="bg-red-650 hover:bg-red-700 text-white px-4 py-2 font-bold uppercase text-[10px] tracking-wide rounded-xl transition cursor-pointer"
                    >
                      Ban Account
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleToggleUserState(viewingUser, 'delete')}
                  className="bg-slate-900 border border-red-500/25 hover:bg-red-950 text-red-400 px-4 py-2 font-bold uppercase text-[10px] tracking-wide rounded-xl transition cursor-pointer"
                >
                  Delete Student record
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================= SYSTEM DIALOG: CUSTOM MODERATION CONFIRMATION ======================= */}
      {confirmModal.isOpen && confirmModal.user && confirmModal.actionType && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-55 backdrop-blur-sm animate-fade-in text-slate-100">
          <div className="bg-slate-950 border border-slate-850 p-6 sm:p-8 rounded-3xl max-w-md w-full space-y-6 text-white shadow-2xl relative">
            <button
              onClick={() => setConfirmModal({ isOpen: false, user: null, actionType: null })}
              className="absolute right-4 top-4 text-slate-400 hover:text-white transition"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-slate-900 border border-slate-800">
                {confirmModal.actionType === 'delete' ? (
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                ) : confirmModal.actionType === 'ban' ? (
                  <Ban className="w-6 h-6 text-red-500" />
                ) : (
                  <Clock className="w-6 h-6 text-amber-500" />
                )}
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-extrabold tracking-tight uppercase">
                  {confirmModal.actionType === 'delete' ? (
                    <span className="text-red-500">Confirm Deletion</span>
                  ) : confirmModal.actionType === 'ban' ? (
                    <span className="text-red-500">Confirm Ban Restriction</span>
                  ) : (
                    <span className="text-amber-500">Confirm Account Suspension</span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Applying restriction to <span className="text-white font-semibold">{confirmModal.user.fullName}</span> ({confirmModal.user.email})
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/50 border border-slate-850/80 rounded-2xl text-[11px] leading-relaxed text-slate-350 space-y-2">
              {confirmModal.actionType === 'delete' && (
                <>
                  <p className="text-red-400 font-bold uppercase tracking-wider text-[10px]">⚠️ Soft-Delete User Account</p>
                  <p>
                    This will soft-delete this user's profile and suspend active logins, but preserves all historical ride postings, student bookings, financial transaction ledgers, and registered vehicle profiles. This ensures full regulatory compliance and retains audit trails intact for college staff.
                  </p>
                </>
              )}
              {confirmModal.actionType === 'ban' && (
                <>
                  <p className="text-red-400 font-bold uppercase tracking-wider text-[10px]">🛑 Platform Expulsion</p>
                  <p>
                    This user will be outright blocked from gaining active session states. They will be notified of their banned status and all their active list offers will be automatically hidden from campus groups.
                  </p>
                </>
              )}
              {confirmModal.actionType === 'suspend' && (
                <>
                  <p className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">⏳ Student Restraint</p>
                  <p>
                    This will temporarily lock the student out of booking rides or posting vehicle seats. They can log in to view their warning details but cannot engage with other students until reactivated.
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setConfirmModal({ isOpen: false, user: null, actionType: null })}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-850 text-xs text-slate-400 font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                Go Back
              </button>
              <button
                onClick={async () => {
                  const targetUser = confirmModal.user;
                  const actionType = confirmModal.actionType;
                  if (targetUser && actionType) {
                    setConfirmModal({ isOpen: false, user: null, actionType: null });
                    await handleToggleUserState(targetUser, actionType, true);
                  }
                }}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer font-sans ${
                  confirmModal.actionType === 'suspend'
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold'
                    : 'bg-red-650 hover:bg-red-700 text-white font-extrabold'
                }`}
              >
                {confirmModal.actionType === 'delete' ? 'Yes, Delete' : confirmModal.actionType === 'ban' ? 'Yes, Ban' : 'Yes, Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= SYSTEM DIALOG: ACCOUNT REJECTION REASON ======================= */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-55 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-950 border border-slate-850 p-6 rounded-3xl max-w-md w-full space-y-4 text-white">
            <h3 className="text-sm font-bold uppercase tracking-wider text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Reject Registration Request
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Please enter the clear rejection reason that will be shown to the student. They will be notified immediately to re-upload.
            </p>

            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Student ID card photo is blurry. Please re-upload clear front and back pictures."
              className="w-full bg-slate-900 border border-slate-800 text-xs text-white rounded-xl p-3 h-24 focus:outline-none focus:border-red-500 placeholder-slate-650"
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRejectionModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-xs text-slate-400 rounded-xl transition"
              >
                Go Back
              </button>
              <button
                onClick={handleFinalizeRejection}
                disabled={!rejectionReason.trim()}
                className="px-4 py-2 bg-red-650 hover:bg-red-750 disabled:bg-red-500/20 disabled:text-red-450 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= SYSTEM DIALOG: DETAILED ID VERIFICATION INSPECTION ======================= */}
      {inspectingVerification && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-55 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-950 border border-slate-800 p-6 sm:p-8 rounded-3xl max-w-4xl w-full mx-auto shadow-2xl relative flex flex-col gap-6 text-white overflow-y-auto max-h-[95vh]">
            
            {/* Header: User metadata */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-850 pb-5">
              <div className="flex items-center gap-4">
                <img 
                  src={inspectingVerification.user.avatarUrl} 
                  alt="Avatar" 
                  className="w-12 h-12 rounded-full object-cover border border-slate-800 shadow" 
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-extrabold text-white">{inspectingVerification.user.fullName}</h3>
                    <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border ${
                      inspectingVerification.user.role === 'rider' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                    }`}>
                      {inspectingVerification.user.role === 'rider' ? 'RIDER' : 'PASSENGER'}
                    </span>
                    <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border ${
                      inspectingVerification.user.verificationStatus === 'approved' 
                        ? 'bg-[#00C896]/10 text-[#00C896] border-[#00C896]/20' 
                        : inspectingVerification.user.verificationStatus === 'pending'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {inspectingVerification.user.verificationStatus.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{inspectingVerification.user.collegeName} • {inspectingVerification.user.email}</p>
                </div>
              </div>
              
              {/* Close Button */}
              <button 
                onClick={() => setInspectingVerification(null)}
                className="absolute top-4 right-4 text-slate-450 hover:text-white bg-slate-900 border border-slate-800 p-2 rounded-full cursor-pointer transition select-none"
                title="Close Inspector"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Split Screen Side-by-Side Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              
              {/* Left Column: ID Card with side select tabs */}
              <div className="flex flex-col gap-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-850">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    Uploaded Student ID ({inspectingVerification.side === 'front' ? 'FRONT' : 'BACK'})
                  </span>
                  {/* Front/Back toggler tabs */}
                  <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setInspectingVerification({ ...inspectingVerification, side: 'front' })}
                      className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition ${
                        inspectingVerification.side === 'front' ? 'bg-[#00C896] text-slate-950 font-extrabold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Front Layout
                    </button>
                    <button
                      onClick={() => setInspectingVerification({ ...inspectingVerification, side: 'back' })}
                      className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition ${
                        inspectingVerification.side === 'back' ? 'bg-[#00C896] text-slate-950 font-extrabold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Back Layout
                    </button>
                  </div>
                </div>
                
                {/* ID Card Display area */}
                <div className="flex-1 min-h-[280px] bg-black/60 rounded-xl overflow-hidden border border-slate-800/80 flex items-center justify-center p-2 group relative">
                  <img 
                    src={inspectingVerification.side === 'front' 
                      ? inspectingVerification.user.verificationDetails?.frontIdCardUrl 
                      : inspectingVerification.user.verificationDetails?.backIdCardUrl
                    } 
                    alt="ID Card zoomed" 
                    className="max-h-[320px] max-w-full object-contain object-center transition duration-300 group-hover:scale-102"
                  />
                  <div className="absolute bottom-2 right-2 bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-lg text-[9px] font-mono tracking-wider text-slate-300">
                    ID Photo
                  </div>
                </div>
              </div>

              {/* Right Column: User Selfie and comparative details */}
              <div className="flex flex-col gap-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-850">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    Student actual selfie photo
                  </span>
                  <span className="text-[9.5px] bg-[#00C896]/10 text-[#00C896] border border-[#00C896]/20 px-2 py-0.5 rounded-full font-mono uppercase font-bold">
                    Comparative Match
                  </span>
                </div>
                
                {/* Selfie Display area */}
                <div className="flex-1 min-h-[280px] bg-black/60 rounded-xl overflow-hidden border border-slate-800/80 flex items-center justify-center p-2 group relative">
                  <img 
                    src={inspectingVerification.user.avatarUrl} 
                    alt="User Selfie Avatar" 
                    className="max-h-[320px] max-w-full object-contain object-center transition duration-300 group-hover:scale-102 rounded-lg scrollbar-none"
                  />
                  <div className="absolute bottom-2 right-2 bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-lg text-[9px] font-mono tracking-wider text-slate-300">
                    Camera Selfie
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Actions section */}
            <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-900/60 p-4 rounded-2xl border border-slate-850 gap-4 mt-2">
              <div className="text-xs text-slate-400 max-w-md">
                <p className="font-semibold text-slate-300">Verification Guideline:</p>
                <p className="mt-0.5 text-[11px]">Ensure the face details in the student ID card match the user's high-quality camera selfie on the right side.</p>
              </div>
              
              {/* If user is still pending verification, show primary action buttons */}
              {inspectingVerification.user.verificationStatus === 'pending' ? (
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => handleRejectFromInspecting(inspectingVerification.user)}
                    disabled={isProcessingAction}
                    className="flex-1 sm:flex-initial px-5 py-2.5 bg-red-650 hover:bg-red-750 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer"
                  >
                    <X className="w-4 h-4" /> Reject Request
                  </button>
                  <button
                    onClick={() => handleApproveFromInspecting(inspectingVerification.user)}
                    disabled={isProcessingAction}
                    className="flex-1 sm:flex-initial px-6 py-2.5 bg-[#00C896] hover:bg-emerald-400 text-[#0f172a] rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 uppercase tracking-widest cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    {isProcessingAction ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Processing...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" /> Approve Member
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
                    <CheckCircle className="w-4 h-4 text-[#00C896]" /> Decided Profile
                  </div>
                  <button
                    onClick={() => setInspectingVerification(null)}
                    className="px-5 py-2.5 bg-slate-850 hover:bg-slate-850 text-xs text-slate-300 font-bold uppercase rounded-xl transition cursor-pointer select-none"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Admin Cancel Subscription Confirmation Modal */}

      {/* Admin Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[99999] max-w-sm w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-2xl flex items-start gap-3 text-slate-200">
          <div className={`p-1.5 rounded-lg shrink-0 ${toast.type === 'success' ? 'bg-emerald-500/10 text-[#00C896]' : toast.type === 'error' ? 'bg-rose-500/10 text-rose-400' : 'bg-blue-500/10 text-blue-400'}`}>
            {toast.type === 'success' ? <Check className="w-5 h-5" /> : toast.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-xs font-bold text-white uppercase tracking-wider">{toast.type === 'success' ? 'Admin Action Done' : toast.type === 'error' ? 'Admin Error' : 'Notice'}</p>
            <p className="text-[11px] text-slate-350 leading-relaxed">{toast.message}</p>
          </div>
          <button 
            type="button"
            onClick={() => setToast(null)} 
            className="text-slate-500 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
}
