/**
 * Settings Page (/settings) - Component-Based Architecture
 *
 * Canvas API credentials management and configuration.
 * Migrated to use the new component-based architecture with Layout component.
 */

import { useState, useEffect } from "react";
import Layout from "../components/layout/Layout";
import PageContainer from "../components/layout/PageContainer";
import { useCanvasAuth } from "../components/canvas/useCanvasAuth";
import { useCanvasCourse } from "../components/canvas/useCanvasCourse";
import { clearCache } from "../js/canvasApi";
import { useConvexConnectionState } from "convex/react";

export default function Settings() {
  const { apiUrl, apiKey, courseId, updateCredentials } = useCanvasAuth();
  const { courseName } = useCanvasCourse();
  const { isWebSocketConnected } = useConvexConnectionState();

  const [localApiUrl, setLocalApiUrl] = useState("");
  const [localApiKey, setLocalApiKey] = useState("");
  const [localCourseId, setLocalCourseId] = useState("");
  const [saved, setSaved] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  // Google Sheets integration state
  const [googleSheetsId, setGoogleSheetsId] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [sheetsTestResult, setSheetsTestResult] = useState(null);

  // facilitator state
  const [facilitatorName, setFacilitatorName] = useState("");

  useEffect(() => {
    setLocalApiUrl(apiUrl || "https://bostoncollege.instructure.com/api/v1");
    setLocalApiKey(apiKey);
    setLocalCourseId(courseId);
  }, [apiUrl, apiKey, courseId]);

  // Load Google Sheets settings and facilitator info only once on component mount
  useEffect(() => {
    const loadedSheetId = localStorage.getItem("google_sheets_id") || "";
    const loadedApiKey = localStorage.getItem("google_api_key") || "";

    console.log("📥 Loading Google Sheets settings (mount):", {
      sheetId: loadedSheetId ? "present" : "empty",
      apiKey: loadedApiKey ? "present" : "empty",
    });
    const loadedFacilitatorName =
      localStorage.getItem("facilitator_name") || "";
    setGoogleSheetsId(loadedSheetId);
    setGoogleApiKey(loadedApiKey);
    setFacilitatorName(loadedFacilitatorName);
  }, []); // Empty dependency array = only run on mount

  function handleSave() {
    updateCredentials(localApiUrl, localApiKey, localCourseId);

    // Save Google Sheets settings
    console.log("💾 Saving Google Sheets settings:", {
      sheetId: googleSheetsId ? "present" : "empty",
      apiKey: googleApiKey ? "present" : "empty",
      sheetIdValue: googleSheetsId,
      apiKeyValue: googleApiKey ? "***" : "empty",
    });

    localStorage.setItem("google_sheets_id", googleSheetsId);
    localStorage.setItem("google_api_key", googleApiKey);
    localStorage.setItem("facilitator_name", facilitatorName);

    // Verify they were saved
    const savedSheetId = localStorage.getItem("google_sheets_id");
    const savedApiKey = localStorage.getItem("google_api_key");
    console.log("✓ Verified saved Google Sheets settings:", {
      sheetId: savedSheetId ? "present" : "empty",
      apiKey: savedApiKey ? "present" : "empty",
    });

    // Clear cache when credentials are updated
    if (localCourseId) {
      clearCache(localCourseId);
    }

    // Clear Google Sheets cache if settings changed
    if (typeof window !== "undefined" && window.googleSheetsApi) {
      window.googleSheetsApi.clearSheetsCache();
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleClearCache() {
    if (courseId) {
      clearCache(courseId);
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
    }
  }

  async function testGoogleSheetsConnection() {
    if (!googleSheetsId || !googleApiKey) {
      setSheetsTestResult({
        success: false,
        message: "Please enter both Google Sheets ID and API key",
      });
      return;
    }

    setSheetsTestResult({ testing: true });

    try {
      // Load Google Sheets API if not already loaded
      if (typeof window !== "undefined" && !window.googleSheetsApi) {
        const script = document.createElement("script");
        script.src = "/js/googleSheetsApi.js";
        document.head.appendChild(script);
        await new Promise((resolve) => (script.onload = resolve));
      }

      const result = await window.googleSheetsApi.fetchGoogleSheetsData(
        googleSheetsId,
        googleApiKey
      );

      setSheetsTestResult({
        success: true,
        message: `✅ Successfully connected! Found ${result.length} user records.`,
        data: result.slice(0, 3), // Show first 3 records as preview
      });
    } catch (error) {
      setSheetsTestResult({
        success: false,
        message: `❌ Connection failed: ${error.message}`,
      });
    }

    setTimeout(() => setSheetsTestResult(null), 10000);
  }

  return (
    <Layout containerWidth="narrow">
      <PageContainer>
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">
            Canvas API Settings
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Canvas API URL
              </label>
              <input
                type="text"
                value={localApiUrl}
                onChange={(e) => setLocalApiUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ "--tw-ring-color": "#003957" }}
                placeholder="https://yourschool.instructure.com/api/v1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Your Canvas instance API URL (usually ends with /api/v1)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Canvas API Access Token
              </label>
              <input
                type="password"
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ "--tw-ring-color": "#003957" }}
                placeholder="Your Canvas API token"
              />
              <p className="text-xs text-gray-500 mt-1">
                Generate this in Canvas under Account → Settings → Approved
                Integrations
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Course ID
              </label>
              <input
                type="text"
                value={localCourseId}
                onChange={(e) => setLocalCourseId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ "--tw-ring-color": "#003957" }}
                placeholder="12345"
              />
              <p className="text-xs text-gray-500 mt-1">
                Found in your Canvas course URL
              </p>
            </div>

            {courseName && (
              <div
                className="rounded-md p-3"
                style={{
                  backgroundColor: "var(--color-success)",
                  borderColor: "var(--color-success-content)",
                  border: "var(--border) solid",
                }}
              >
                <p
                  className="text-sm"
                  style={{ color: "var(--color-success-content)" }}
                >
                  <strong>Connected to:</strong> {courseName}
                </p>
              </div>
            )}
          </div>
        </div>
        {/* Convex Connection Status */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Convex Connection Status
          </h2>
          <div className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full mr-3 ${isWebSocketConnected ? "bg-green-500" : "bg-red-500"}`}
            ></div>
            <p className="text-gray-700">
              {isWebSocketConnected
                ? "Connected to Convex backend"
                : "Disconnected from Convex backend"}
            </p>
          </div>
        </div>

        {/* Facilitator Name Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Facilitator Settings
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={facilitatorName}
              onChange={(e) => setFacilitatorName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ "--tw-ring-color": "#003957" }}
              placeholder="Enter facilitator name"
            />
            <p className="text-xs text-gray-500 mt-1">
              This name will be associated with any thread status updates you
              make.
            </p>
          </div>
        </div>

        {/* Google Sheets Integration Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">
            📊 Google Sheets Integration
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Enhance user profiles with additional data from Google Sheets.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Google Sheets ID
              </label>
              <input
                type="text"
                value={googleSheetsId}
                onChange={(e) => {
                  console.log("📝 Google Sheets ID changed:", e.target.value);
                  setGoogleSheetsId(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ "--tw-ring-color": "#003957" }}
                placeholder="e.g., 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              />
              <p className="text-xs text-gray-500 mt-1">
                Found in the URL: https://docs.google.com/spreadsheets/d/
                <strong>SHEET_ID</strong>/edit
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Google Sheets API Key
              </label>
              <input
                type="password"
                value={googleApiKey}
                onChange={(e) => {
                  console.log(
                    "🔑 Google API Key changed:",
                    e.target.value ? "***" : "empty"
                  );
                  setGoogleApiKey(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ "--tw-ring-color": "#003957" }}
                placeholder="Google Sheets API Key"
              />
              <p className="text-xs text-gray-500 mt-1">
                <a
                  href="https://developers.google.com/sheets/api/guides/authorizing#APIKey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-90 transition-colors"
                  style={{ color: "var(--color-secondary)" }}
                >
                  How to get a Google Sheets API key
                </a>
              </p>
            </div>

            {/* Test Connection Button */}
            <button
              onClick={testGoogleSheetsConnection}
              disabled={
                !googleSheetsId || !googleApiKey || sheetsTestResult?.testing
              }
              className="px-4 py-2 font-semibold hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "var(--color-info)",
                color: "var(--color-info-content)",
                borderRadius: "var(--radius-field)",
              }}
            >
              {sheetsTestResult?.testing ? "Testing..." : "Test Connection"}
            </button>

            {/* Test Results */}
            {sheetsTestResult && !sheetsTestResult.testing && (
              <div
                className="p-3 rounded-md"
                style={{
                  backgroundColor: sheetsTestResult.success
                    ? "var(--color-success)"
                    : "var(--color-error)",
                  borderColor: sheetsTestResult.success
                    ? "var(--color-success-content)"
                    : "var(--color-error-content)",
                  border: "var(--border) solid",
                }}
              >
                <p
                  className="font-medium"
                  style={{
                    color: sheetsTestResult.success
                      ? "var(--color-success-content)"
                      : "var(--color-error-content)",
                  }}
                >
                  {sheetsTestResult.message}
                </p>
                {sheetsTestResult.data && (
                  <div className="mt-2 text-sm">
                    <p className="font-medium">Preview (first 3 records):</p>
                    <ul className="mt-1 space-y-1">
                      {sheetsTestResult.data.map((record, index) => (
                        <li
                          key={index}
                          className="bg-white bg-opacity-20 p-2 rounded"
                        >
                          <strong>{record.displayName}</strong>
                          {record.institution && ` - ${record.institution}`}
                          {record.title && ` (${record.title})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Schema Information */}
            <div
              className="p-3 rounded-md text-sm"
              style={{
                backgroundColor: "var(--color-neutral)",
                borderColor: "var(--color-neutral-content)",
                border: "var(--border) solid",
              }}
            >
              <p
                className="font-medium mb-2"
                style={{ color: "var(--color-neutral-content)" }}
              >
                Required Sheet Format:
              </p>
              <div
                className="grid grid-cols-2 gap-2 text-xs"
                style={{ color: "var(--color-neutral-content)" }}
              >
                <div>
                  <strong>Column A:</strong> Display Name
                </div>
                <div>
                  <strong>Column B:</strong> Institution
                </div>
                <div>
                  <strong>Column C:</strong> Title
                </div>
                <div>
                  <strong>Column D:</strong> Notes
                </div>
                <div>
                  <strong>Column E:</strong> Assistant Type
                </div>
                <div>
                  <strong>Column F:</strong> Tags
                </div>
                <div>
                  <strong>Column G:</strong> Custom Field 1
                </div>
                <div>
                  <strong>Column H:</strong> Custom Field 2
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-4 pt-4">
              <button
                onClick={handleSave}
                className="px-6 py-2 font-semibold hover:opacity-90 transition-colors"
                style={{
                  backgroundColor: "var(--color-secondary)",
                  color: "var(--color-secondary-content)",
                  borderRadius: "var(--radius-field)",
                }}
              >
                Save Settings
              </button>

              <button
                onClick={handleClearCache}
                className="px-6 py-2 font-semibold hover:opacity-90 transition-colors"
                style={{
                  backgroundColor: "var(--color-secondary)",
                  color: "var(--color-secondary-content)",
                  borderRadius: "var(--radius-field)",
                }}
                disabled={!courseId}
              >
                Clear Cache
              </button>

              {saved && (
                <span
                  className="font-medium"
                  style={{ color: "var(--color-success-content)" }}
                >
                  Settings saved!
                </span>
              )}

              {cacheCleared && (
                <span
                  className="font-medium"
                  style={{ color: "var(--color-info-content)" }}
                >
                  Cache cleared!
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          className="rounded-lg p-6"
          style={{
            backgroundColor: "var(--color-info)",
            borderColor: "var(--color-info-content)",
            border: "var(--border) solid",
          }}
        >
          <h3
            className="text-lg font-semibold mb-3"
            style={{ color: "var(--color-info-content)" }}
          >
            Setup Instructions
          </h3>
          <div
            className="text-sm space-y-2"
            style={{ color: "var(--color-info-content)" }}
          >
            <p>
              <strong>1. Get your Canvas API URL:</strong> Usually
              https://yourschool.instructure.com/api/v1
            </p>
            <p>
              <strong>2. Generate an API token:</strong> Go to Canvas → Account
              → Settings → Approved Integrations → New Access Token
            </p>
            <p>
              <strong>3. Find your Course ID:</strong> Look at your course URL -
              it's the number after /courses/
            </p>
            <p>
              <strong>4. Save settings:</strong> Click "Save Settings" to store
              your credentials locally
            </p>
          </div>
        </div>
      </PageContainer>
    </Layout>
  );
}
