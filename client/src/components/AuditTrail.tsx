import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import axios from 'axios';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: {
    user?: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    duration?: number;
    [key: string]: any;
  };
  category: 'audit' | 'security' | 'performance' | 'robot' | 'hardware' | 'general';
}

interface AuditFilters {
  category: string;
  level: string;
  user: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

const AuditTrail: React.FC = () => {
  const { state } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AuditFilters>({
    category: 'all',
    level: 'all',
    user: 'all',
    dateFrom: '',
    dateTo: '',
    search: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    loadAuditLogs();
  }, [filters, pagination.page]);

  const loadAuditLogs = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value && value !== 'all')
        )
      });

      const response = await axios.get(`/api/audit/logs?${params}`);
      
      if (response.data.success) {
        setLogs(response.data.logs);
        setPagination(prev => ({
          ...prev,
          total: response.data.total,
          totalPages: response.data.totalPages
        }));
      }
    } catch (error: any) {
      console.error('Error loading audit logs:', error);
      setError(error.response?.data?.message || 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (key: keyof AuditFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  const handleClearFilters = () => {
    setFilters({
      category: 'all',
      level: 'all',
      user: 'all',
      dateFrom: '',
      dateTo: '',
      search: ''
    });
  };

  const handleExportLogs = async () => {
    try {
      const params = new URLSearchParams({
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value && value !== 'all')
        ),
        export: 'true'
      });

      const response = await axios.get(`/api/audit/logs?${params}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting logs:', error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return '#dc3545';
      case 'warn': return '#ffc107';
      case 'info': return '#17a2b8';
      case 'debug': return '#6c757d';
      default: return '#343a40';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'audit': return '📋';
      case 'security': return '🔒';
      case 'performance': return '⚡';
      case 'robot': return '🤖';
      case 'hardware': return '🔧';
      default: return '📄';
    }
  };

  const renderLogDetails = (log: LogEntry) => {
    if (!log.meta || Object.keys(log.meta).length === 0) {
      return null;
    }

    return (
      <div className="log-details">
        {Object.entries(log.meta).map(([key, value]) => (
          <span key={key} className="log-detail">
            <strong>{key}:</strong> {String(value)}
          </span>
        ))}
      </div>
    );
  };

  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <div className="audit-trail">
        <div className="page-header">
          <h2>Audit Trail</h2>
          <div className="header-actions">
            <button onClick={handleExportLogs} className="btn-secondary">
              Export Logs
            </button>
            <button onClick={loadAuditLogs} className="btn-primary">
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="audit-filters">
          <div className="filters-row">
            <div className="filter-group">
              <label>Category</label>
              <select
                value={filters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
              >
                <option value="all">All Categories</option>
                <option value="audit">Audit</option>
                <option value="security">Security</option>
                <option value="performance">Performance</option>
                <option value="robot">Robot Control</option>
                <option value="hardware">Hardware</option>
                <option value="general">General</option>
              </select>
            </div>
            
            <div className="filter-group">
              <label>Level</label>
              <select
                value={filters.level}
                onChange={(e) => handleFilterChange('level', e.target.value)}
              >
                <option value="all">All Levels</option>
                <option value="error">Error</option>
                <option value="warn">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
            </div>
            
            <div className="filter-group">
              <label>Date From</label>
              <input
                type="datetime-local"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>
            
            <div className="filter-group">
              <label>Date To</label>
              <input
                type="datetime-local"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>
          </div>
          
          <div className="filters-row">
            <div className="filter-group search-group">
              <label>Search</label>
              <input
                type="text"
                placeholder="Search in messages..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </div>
            
            <div className="filter-actions">
              <button onClick={handleClearFilters} className="btn-secondary">
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {/* Logs Table */}
        {isLoading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading audit logs...</p>
          </div>
        ) : (
          <div className="logs-container">
            <div className="logs-header">
              <div className="logs-info">
                Showing {logs.length} of {pagination.total} entries
              </div>
            </div>
            
            <div className="logs-table-container">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Category</th>
                    <th>Level</th>
                    <th>Message</th>
                    <th>User</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, index) => (
                    <tr key={index} className={`log-level-${log.level}`}>
                      <td className="timestamp-cell">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className="category-cell">
                        <span className="category-badge">
                          <span className="category-icon">
                            {getCategoryIcon(log.category)}
                          </span>
                          {log.category}
                        </span>
                      </td>
                      <td className="level-cell">
                        <span
                          className="level-badge"
                          style={{ backgroundColor: getLevelColor(log.level) }}
                        >
                          {log.level.toUpperCase()}
                        </span>
                      </td>
                      <td className="message-cell">
                        <div className="log-message">{log.message}</div>
                        {renderLogDetails(log)}
                      </td>
                      <td className="user-cell">
                        {log.meta?.user || log.meta?.userId || 'System'}
                      </td>
                      <td className="details-cell">
                        {log.meta?.ip && (
                          <div className="detail-item">IP: {log.meta.ip}</div>
                        )}
                        {log.meta?.endpoint && (
                          <div className="detail-item">
                            {log.meta.method} {log.meta.endpoint}
                          </div>
                        )}
                        {log.meta?.statusCode && (
                          <div className="detail-item">Status: {log.meta.statusCode}</div>
                        )}
                        {log.meta?.duration && (
                          <div className="detail-item">Duration: {log.meta.duration}ms</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {logs.length === 0 && (
                <div className="empty-state">
                  <p>No audit logs found matching the current filters</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="btn-sm btn-secondary"
                >
                  Previous
                </button>
                
                <span className="pagination-info">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page === pagination.totalPages}
                  className="btn-sm btn-secondary"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
};

export default AuditTrail;