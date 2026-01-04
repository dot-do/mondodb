/**
 * ConnectionForm Component
 *
 * Form for creating and editing database connections.
 * Supports both URI input and manual form configuration.
 */

import React, { useState, useCallback, useEffect } from 'react'
import {
  ConnectionFormValues,
  DEFAULT_CONNECTION_FORM_VALUES,
  parseConnectionURI,
  buildConnectionURI,
  AuthType,
} from '../../types/connection'

/**
 * ConnectionForm props
 */
export interface ConnectionFormProps {
  /**
   * Initial form values (for editing existing connection)
   */
  initialValues?: Partial<ConnectionFormValues>

  /**
   * Whether the form is in edit mode
   */
  isEditing?: boolean

  /**
   * Whether the form is loading/submitting
   */
  isLoading?: boolean

  /**
   * Error message to display
   */
  error?: string

  /**
   * Callback when form is submitted
   */
  onSubmit: (values: ConnectionFormValues) => void

  /**
   * Callback when save button is clicked
   */
  onSave?: (values: ConnectionFormValues) => void

  /**
   * Callback when test connection is clicked
   */
  onTest?: (values: ConnectionFormValues) => Promise<{ success: boolean; error?: string; latencyMs?: number }>

  /**
   * Callback when form is cancelled
   */
  onCancel?: () => void

  /**
   * Custom class name
   */
  className?: string
}

/**
 * Tab type for connection method selection
 */
type ConnectionTab = 'uri' | 'form'

/**
 * ConnectionForm component
 */
export function ConnectionForm({
  initialValues,
  isEditing = false,
  isLoading = false,
  error,
  onSubmit,
  onSave,
  onTest,
  onCancel,
  className = '',
}: ConnectionFormProps): React.ReactElement {
  // Form state
  const [values, setValues] = useState<ConnectionFormValues>(() => ({
    ...DEFAULT_CONNECTION_FORM_VALUES,
    ...initialValues,
  }))

  // Active tab
  const [activeTab, setActiveTab] = useState<ConnectionTab>(
    initialValues?.connectionMethod || 'uri'
  )

  // Test result state
  const [testResult, setTestResult] = useState<{
    success?: boolean
    error?: string
    latencyMs?: number
    testing: boolean
  }>({ testing: false })

  // Show advanced options
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Update values when initialValues change
  useEffect(() => {
    if (initialValues) {
      setValues((prev) => ({ ...prev, ...initialValues }))
    }
  }, [initialValues])

  /**
   * Handle input change
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value, type } = e.target
      const checked = (e.target as HTMLInputElement).checked

      setValues((prev) => {
        const newValue = type === 'checkbox' ? checked : type === 'number' ? Number(value) : value

        // If URI changes, parse it and update form fields
        if (name === 'uri' && activeTab === 'uri') {
          const parsed = parseConnectionURI(value)
          return {
            ...prev,
            ...parsed,
            connectionMethod: 'uri',
          }
        }

        // If form fields change, rebuild URI
        const updated = { ...prev, [name]: newValue }
        if (activeTab === 'form' && name !== 'uri') {
          updated.uri = buildConnectionURI(updated)
        }

        return updated
      })

      // Clear test result on change
      setTestResult({ testing: false })
    },
    [activeTab]
  )

  /**
   * Handle tab change
   */
  const handleTabChange = useCallback((tab: ConnectionTab) => {
    setActiveTab(tab)
    setValues((prev) => ({
      ...prev,
      connectionMethod: tab,
    }))
  }, [])

  /**
   * Handle form submit
   */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      onSubmit(values)
    },
    [values, onSubmit]
  )

  /**
   * Handle save
   */
  const handleSave = useCallback(() => {
    onSave?.(values)
  }, [values, onSave])

  /**
   * Handle test connection
   */
  const handleTest = useCallback(async () => {
    if (!onTest) return

    setTestResult({ testing: true })

    try {
      const result = await onTest(values)
      setTestResult({
        testing: false,
        success: result.success,
        error: result.error,
        latencyMs: result.latencyMs,
      })
    } catch (err) {
      setTestResult({
        testing: false,
        success: false,
        error: err instanceof Error ? err.message : 'Test failed',
      })
    }
  }, [values, onTest])

  /**
   * Auth type options
   */
  const authTypes: { value: AuthType; label: string }[] = [
    { value: 'none', label: 'No Authentication' },
    { value: 'basic', label: 'Username / Password' },
    { value: 'x509', label: 'X.509 Certificate' },
    { value: 'aws', label: 'AWS IAM' },
    { value: 'kerberos', label: 'Kerberos' },
  ]

  const formStyles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
      padding: '20px',
      backgroundColor: '#1e1e1e',
      borderRadius: '8px',
      color: '#e0e0e0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px',
    },
    title: {
      fontSize: '18px',
      fontWeight: 600,
      margin: 0,
    },
    tabs: {
      display: 'flex',
      borderBottom: '1px solid #333',
      marginBottom: '16px',
    },
    tab: (active: boolean) => ({
      padding: '8px 16px',
      cursor: 'pointer',
      border: 'none',
      background: 'none',
      color: active ? '#4fc3f7' : '#888',
      borderBottom: active ? '2px solid #4fc3f7' : '2px solid transparent',
      fontWeight: active ? 600 : 400,
      transition: 'all 0.2s',
    }),
    formGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '6px',
    },
    label: {
      fontSize: '13px',
      color: '#aaa',
      fontWeight: 500,
    },
    input: {
      padding: '10px 12px',
      borderRadius: '4px',
      border: '1px solid #444',
      backgroundColor: '#2d2d2d',
      color: '#e0e0e0',
      fontSize: '14px',
      outline: 'none',
      transition: 'border-color 0.2s',
    },
    inputFocus: {
      borderColor: '#4fc3f7',
    },
    select: {
      padding: '10px 12px',
      borderRadius: '4px',
      border: '1px solid #444',
      backgroundColor: '#2d2d2d',
      color: '#e0e0e0',
      fontSize: '14px',
      outline: 'none',
      cursor: 'pointer',
    },
    row: {
      display: 'flex',
      gap: '12px',
    },
    halfWidth: {
      flex: 1,
    },
    checkbox: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
    },
    checkboxInput: {
      width: '16px',
      height: '16px',
      cursor: 'pointer',
    },
    advancedToggle: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: '#888',
      cursor: 'pointer',
      fontSize: '13px',
      padding: '8px 0',
      border: 'none',
      background: 'none',
    },
    buttonGroup: {
      display: 'flex',
      gap: '12px',
      marginTop: '16px',
    },
    button: (variant: 'primary' | 'secondary' | 'ghost') => ({
      padding: '10px 20px',
      borderRadius: '4px',
      border: variant === 'ghost' ? 'none' : '1px solid',
      cursor: isLoading ? 'not-allowed' : 'pointer',
      fontWeight: 500,
      fontSize: '14px',
      transition: 'all 0.2s',
      opacity: isLoading ? 0.7 : 1,
      ...(variant === 'primary' && {
        backgroundColor: '#4fc3f7',
        borderColor: '#4fc3f7',
        color: '#000',
      }),
      ...(variant === 'secondary' && {
        backgroundColor: 'transparent',
        borderColor: '#4fc3f7',
        color: '#4fc3f7',
      }),
      ...(variant === 'ghost' && {
        backgroundColor: 'transparent',
        color: '#888',
      }),
    }),
    error: {
      padding: '12px',
      backgroundColor: 'rgba(244, 67, 54, 0.1)',
      border: '1px solid #f44336',
      borderRadius: '4px',
      color: '#f44336',
      fontSize: '13px',
    },
    success: {
      padding: '12px',
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
      border: '1px solid #4caf50',
      borderRadius: '4px',
      color: '#4caf50',
      fontSize: '13px',
    },
    testResult: (success: boolean) => ({
      padding: '12px',
      backgroundColor: success ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
      border: `1px solid ${success ? '#4caf50' : '#f44336'}`,
      borderRadius: '4px',
      color: success ? '#4caf50' : '#f44336',
      fontSize: '13px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    }),
  }

  return (
    <form
      className={`connection-form ${className}`}
      style={formStyles.container}
      onSubmit={handleSubmit}
      data-testid="connection-form"
    >
      {/* Header */}
      <div style={formStyles.header}>
        <h3 style={formStyles.title}>{isEditing ? 'Edit Connection' : 'New Connection'}</h3>
      </div>

      {/* Connection Name */}
      <div style={formStyles.formGroup}>
        <label style={formStyles.label} htmlFor="name">
          Connection Name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={values.name}
          onChange={handleChange}
          style={formStyles.input}
          placeholder="My Connection"
          data-testid="connection-name-input"
        />
      </div>

      {/* Tabs */}
      <div style={formStyles.tabs}>
        <button
          type="button"
          style={formStyles.tab(activeTab === 'uri')}
          onClick={() => handleTabChange('uri')}
          data-testid="uri-tab"
        >
          URI
        </button>
        <button
          type="button"
          style={formStyles.tab(activeTab === 'form')}
          onClick={() => handleTabChange('form')}
          data-testid="form-tab"
        >
          Advanced
        </button>
      </div>

      {/* URI Input */}
      {activeTab === 'uri' && (
        <div style={formStyles.formGroup}>
          <label style={formStyles.label} htmlFor="uri">
            Connection String
          </label>
          <input
            type="text"
            id="uri"
            name="uri"
            value={values.uri}
            onChange={handleChange}
            style={formStyles.input}
            placeholder="mondodb://localhost:27017"
            data-testid="connection-uri-input"
          />
        </div>
      )}

      {/* Form Fields */}
      {activeTab === 'form' && (
        <>
          {/* Host and Port */}
          <div style={formStyles.row}>
            <div style={{ ...formStyles.formGroup, ...formStyles.halfWidth }}>
              <label style={formStyles.label} htmlFor="host">
                Host
              </label>
              <input
                type="text"
                id="host"
                name="host"
                value={values.host}
                onChange={handleChange}
                style={formStyles.input}
                placeholder="localhost"
                data-testid="connection-host-input"
              />
            </div>
            <div style={{ ...formStyles.formGroup, width: '120px' }}>
              <label style={formStyles.label} htmlFor="port">
                Port
              </label>
              <input
                type="number"
                id="port"
                name="port"
                value={values.port}
                onChange={handleChange}
                style={formStyles.input}
                placeholder="27017"
                data-testid="connection-port-input"
              />
            </div>
          </div>

          {/* Database */}
          <div style={formStyles.formGroup}>
            <label style={formStyles.label} htmlFor="database">
              Database
            </label>
            <input
              type="text"
              id="database"
              name="database"
              value={values.database}
              onChange={handleChange}
              style={formStyles.input}
              placeholder="test"
              data-testid="connection-database-input"
            />
          </div>

          {/* Authentication */}
          <div style={formStyles.formGroup}>
            <label style={formStyles.label} htmlFor="authType">
              Authentication
            </label>
            <select
              id="authType"
              name="authType"
              value={values.authType}
              onChange={handleChange}
              style={formStyles.select}
              data-testid="connection-auth-select"
            >
              {authTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Username and Password (for basic auth) */}
          {values.authType === 'basic' && (
            <>
              <div style={formStyles.row}>
                <div style={{ ...formStyles.formGroup, ...formStyles.halfWidth }}>
                  <label style={formStyles.label} htmlFor="username">
                    Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={values.username}
                    onChange={handleChange}
                    style={formStyles.input}
                    placeholder="Username"
                    data-testid="connection-username-input"
                  />
                </div>
                <div style={{ ...formStyles.formGroup, ...formStyles.halfWidth }}>
                  <label style={formStyles.label} htmlFor="password">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={values.password}
                    onChange={handleChange}
                    style={formStyles.input}
                    placeholder="Password"
                    data-testid="connection-password-input"
                  />
                </div>
              </div>
              <div style={formStyles.formGroup}>
                <label style={formStyles.label} htmlFor="authSource">
                  Auth Source
                </label>
                <input
                  type="text"
                  id="authSource"
                  name="authSource"
                  value={values.authSource}
                  onChange={handleChange}
                  style={formStyles.input}
                  placeholder="admin"
                  data-testid="connection-authsource-input"
                />
              </div>
            </>
          )}

          {/* TLS */}
          <div style={formStyles.formGroup}>
            <label style={formStyles.checkbox}>
              <input
                type="checkbox"
                name="tlsEnabled"
                checked={values.tlsEnabled}
                onChange={handleChange}
                style={formStyles.checkboxInput}
                data-testid="connection-tls-checkbox"
              />
              <span>Enable TLS/SSL</span>
            </label>
          </div>

          {values.tlsEnabled && (
            <div style={formStyles.formGroup}>
              <label style={formStyles.checkbox}>
                <input
                  type="checkbox"
                  name="tlsAllowInvalidCertificates"
                  checked={values.tlsAllowInvalidCertificates}
                  onChange={handleChange}
                  style={formStyles.checkboxInput}
                  data-testid="connection-tls-invalid-checkbox"
                />
                <span>Allow Invalid Certificates</span>
              </label>
            </div>
          )}

          {/* Advanced Options Toggle */}
          <button
            type="button"
            style={formStyles.advancedToggle}
            onClick={() => setShowAdvanced(!showAdvanced)}
            data-testid="advanced-toggle"
          >
            <span>{showAdvanced ? '[-]' : '[+]'}</span>
            <span>Advanced Options</span>
          </button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div style={formStyles.row}>
              <div style={{ ...formStyles.formGroup, ...formStyles.halfWidth }}>
                <label style={formStyles.label} htmlFor="connectTimeoutMS">
                  Connect Timeout (ms)
                </label>
                <input
                  type="number"
                  id="connectTimeoutMS"
                  name="connectTimeoutMS"
                  value={values.connectTimeoutMS}
                  onChange={handleChange}
                  style={formStyles.input}
                  placeholder="10000"
                  data-testid="connection-timeout-input"
                />
              </div>
              <div style={{ ...formStyles.formGroup, ...formStyles.halfWidth }}>
                <label style={formStyles.label} htmlFor="maxPoolSize">
                  Max Pool Size
                </label>
                <input
                  type="number"
                  id="maxPoolSize"
                  name="maxPoolSize"
                  value={values.maxPoolSize}
                  onChange={handleChange}
                  style={formStyles.input}
                  placeholder="100"
                  data-testid="connection-pool-input"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Error Display */}
      {error && (
        <div style={formStyles.error} data-testid="connection-error">
          {error}
        </div>
      )}

      {/* Test Result Display */}
      {testResult.success !== undefined && !testResult.testing && (
        <div
          style={formStyles.testResult(testResult.success)}
          data-testid="test-result"
        >
          {testResult.success ? (
            <>
              <span>[OK]</span>
              <span>
                Connection successful
                {testResult.latencyMs !== undefined && ` (${testResult.latencyMs}ms)`}
              </span>
            </>
          ) : (
            <>
              <span>[X]</span>
              <span>{testResult.error || 'Connection failed'}</span>
            </>
          )}
        </div>
      )}

      {/* Buttons */}
      <div style={formStyles.buttonGroup}>
        <button
          type="submit"
          style={formStyles.button('primary')}
          disabled={isLoading}
          data-testid="connect-button"
        >
          {isLoading ? 'Connecting...' : 'Connect'}
        </button>

        {onTest && (
          <button
            type="button"
            style={formStyles.button('secondary')}
            onClick={handleTest}
            disabled={isLoading || testResult.testing}
            data-testid="test-button"
          >
            {testResult.testing ? 'Testing...' : 'Test Connection'}
          </button>
        )}

        {onSave && (
          <button
            type="button"
            style={formStyles.button('secondary')}
            onClick={handleSave}
            disabled={isLoading}
            data-testid="save-button"
          >
            Save
          </button>
        )}

        {onCancel && (
          <button
            type="button"
            style={formStyles.button('ghost')}
            onClick={onCancel}
            disabled={isLoading}
            data-testid="cancel-button"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default ConnectionForm
