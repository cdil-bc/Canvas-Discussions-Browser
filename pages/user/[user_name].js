import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { useRouter } from "next/router";
import Layout from "../../components/layout/Layout";
import PageContainer from "../../components/layout/PageContainer";
import { useCanvasAuth } from "../../components/canvas/useCanvasAuth";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ErrorMessage from "../../components/ui/ErrorMessage";
import CredentialsRequired from "../../components/ui/CredentialsRequired";
import { fetchCanvasUserPosts } from "../../js/canvasApi";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function UserPage() {
  const router = useRouter();
  const { user_name } = router.query;
  const { credentialsMissing, apiUrl, apiKey, courseId } = useCanvasAuth();

  const [posts, setPosts] = useState([]);
  const [studentId, setStudentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [assignmentsMap, setAssignmentsMap] = useState({});
  const [enhancedUserData, setEnhancedUserData] = useState(null);
  const [sheetsLoading, setSheetsLoading] = useState(false);

  // Group posts by parent_id to organize replies
  const organizePostsAndReplies = (posts) => {
    const topLevelPosts = posts.filter((post) => !post.parent_id);
    const repliesByParentId = {};

    posts
      .filter((post) => post.parent_id)
      .forEach((reply) => {
        if (!repliesByParentId[reply.parent_id]) {
          repliesByParentId[reply.parent_id] = [];
        }
        repliesByParentId[reply.parent_id].push(reply);
      });

    return { topLevelPosts, repliesByParentId };
  };

  // Fetch enhanced user data from Google Sheets
  useEffect(() => {
    console.log("🔍 Google Sheets useEffect running for user:", user_name);

    if (!user_name || credentialsMissing()) {
      console.log(
        "❌ Skipping Google Sheets: missing user_name or credentials"
      );
      return;
    }

    const googleSheetsId = localStorage.getItem("google_sheets_id");
    const googleApiKey = localStorage.getItem("google_api_key");

    console.log("🔑 Google Sheets credentials check:", {
      sheetId: googleSheetsId ? "found" : "missing",
      apiKey: googleApiKey ? "found" : "missing",
    });

    if (googleSheetsId && googleApiKey) {
      setSheetsLoading(true);

      // Load Google Sheets API if not already loaded
      if (typeof window !== "undefined" && !window.googleSheetsApi) {
        console.log("📥 Loading Google Sheets API script...");
        const script = document.createElement("script");
        script.src = "/js/googleSheetsApi.js";
        script.onload = () => {
          console.log("✅ Google Sheets API script loaded successfully");
          if (window.googleSheetsApi) {
            console.log("✅ window.googleSheetsApi is available");
            fetchEnhancedUserData(googleSheetsId, googleApiKey);
          } else {
            console.error(
              "❌ window.googleSheetsApi not found after script load"
            );
            setSheetsLoading(false);
          }
        };
        script.onerror = (error) => {
          console.error("❌ Failed to load Google Sheets API script:", error);
          setSheetsLoading(false);
        };
        document.head.appendChild(script);
      } else {
        console.log("✅ Google Sheets API already loaded");
        fetchEnhancedUserData(googleSheetsId, googleApiKey);
      }
    } else {
      console.log(
        "ℹ️ Google Sheets integration not configured - skipping enhanced data"
      );
    }
  }, [user_name]);

  const fetchEnhancedUserData = async (sheetId, apiKey) => {
    console.log("🔍 Fetching enhanced user data for:", user_name, {
      sheetId,
      apiKey: apiKey ? "***" : "missing",
    });

    try {
      // Create a mock canvas user to match against sheets
      const mockCanvasUser = {
        display_name: user_name,
        user_name: user_name,
      };

      console.log("📊 Calling Google Sheets API with user:", mockCanvasUser);

      const result = await window.googleSheetsApi.fetchAndMatchSheetsData({
        sheetId,
        apiKey,
        canvasUsers: [mockCanvasUser],
        useCache: true,
      });

      console.log("📊 Google Sheets API result:", result);

      if (result.success && result.matchedUsers.length > 0) {
        console.log(
          "✅ Found enhanced data:",
          result.matchedUsers[0].enhancedData
        );
        setEnhancedUserData(result.matchedUsers[0].enhancedData);
      } else {
        console.log("❌ No enhanced data found for user:", user_name);
      }
    } catch (error) {
      console.error("❌ Failed to fetch enhanced user data:", error);
    } finally {
      setSheetsLoading(false);
    }
  };

  // Fetch posts and submission status when settings or user_name change
  useEffect(() => {
    if (!user_name || credentialsMissing()) return;

    setLoading(true);
    setError("");

    // Try to extract userId from router query, or fallback to first post
    let userId = undefined;
    if (router.query.user_id) {
      userId = router.query.user_id;
    } else if (posts && posts.length > 0 && posts[0].user_id) {
      userId = posts[0].user_id;
    }

    fetchCanvasUserPosts({
      apiUrl,
      apiKey,
      courseId,
      userName: user_name,
      userId,
    })
      .then(async (posts) => {
        if (posts.length > 0 && posts[0].user_id) {
          setStudentId(posts[0].user_id);
        }
        // 1. Collect all unique assignment_ids
        const assignmentIds = Array.from(
          new Set(posts.map((p) => p.assignment_id).filter(Boolean))
        );
        // 2. Fetch all assignments for the course in one batch
        let allAssignments = [];
        try {
          const allAssignRes = await fetch("/api/canvas-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiUrl,
              apiKey,
              endpoint: `/courses/${courseId}/assignments?per_page=100`,
              method: "GET",
            }),
          });
          if (allAssignRes.ok) {
            allAssignments = await allAssignRes.json();
          }
        } catch {}
        // 3. Map assignment_id to points_possible
        const newAssignmentsMap = {};
        for (const a of allAssignments) {
          newAssignmentsMap[a.id] = a;
        }
        setAssignmentsMap(newAssignmentsMap);
        // 4. For posts with assignment_id and user_id, fetch submission and attach points_possible
        const updatedPosts = await Promise.all(
          posts.map(async (post) => {
            if (post.assignment_id && post.user_id) {
              post.points_possible =
                assignmentsMap[post.assignment_id]?.points_possible;
              try {
                const subRes = await fetch("/api/canvas-proxy", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    apiUrl,
                    apiKey,
                    endpoint: `/courses/${courseId}/assignments/${post.assignment_id}/submissions/${post.user_id}`,
                    method: "GET",
                  }),
                });
                if (subRes.ok) {
                  const submission = await subRes.json();
                  post._isUngraded =
                    !submission ||
                    submission.grade === null ||
                    submission.grade === undefined ||
                    submission.grade === "";
                } else {
                  post._isUngraded = true;
                }
              } catch {
                post._isUngraded = true;
              }
            }
            return post;
          })
        );
        setPosts(updatedPosts);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user_name, apiUrl, apiKey, courseId, credentialsMissing]);

  // Show credentials required page if missing Canvas API settings
  if (credentialsMissing()) {
    return (
      <Layout containerWidth="narrow">
        <PageContainer>
          <CredentialsRequired />
        </PageContainer>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageContainer>
        {/* Single Container Layout */}
        <div className="bg-white rounded-lg shadow-md p-9">
          {/* Page Title */}
          <div className="mb-6 pb-6 flex flex-col gap-2">
            <h1
              className="text-3xl font-bold"
              style={{ color: "var(--color-primary)" }}
            >
              {user_name}
            </h1>
            <StudentClaimStatus studentId={studentId} studentName={user_name} />
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Sidebar - About Section */}
            <div className="lg:col-span-1">
              <div className="sticky top-6">
                <div className="flex items-center justify-between mb-4">
                  <h2
                    className="text-2xl font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    About
                  </h2>
                </div>

                {/* Loading state for sheets data */}
                {sheetsLoading && (
                  <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                      <span className="text-sm text-blue-600">
                        Loading profile data...
                      </span>
                    </div>
                  </div>
                )}

                {/* Enhanced Profile Information */}
                {enhancedUserData ? (
                  <div className="space-y-4">
                    {enhancedUserData.institution && (
                      <div>
                        <span className="text-sm font-bold text-gray-700">
                          Institution
                        </span>
                        <p className="text-gray-800">
                          {enhancedUserData.institution}
                        </p>
                      </div>
                    )}
                    {enhancedUserData.title && (
                      <div>
                        <span className="text-sm font-bold text-gray-700">
                          Title
                        </span>
                        <p className="text-gray-800">
                          {enhancedUserData.title}
                        </p>
                      </div>
                    )}
                    {enhancedUserData.assistantType && (
                      <div>
                        <span className="text-sm font-bold text-gray-700">
                          Assistant Type
                        </span>
                        <p className="text-gray-800">
                          {enhancedUserData.assistantType}
                        </p>
                      </div>
                    )}
                    {enhancedUserData.tags &&
                      enhancedUserData.tags.length > 0 && (
                        <div>
                          <span className="text-sm font-bold text-gray-700">
                            Tags
                          </span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {enhancedUserData.tags.map((tag, index) => (
                              <span
                                key={index}
                                className="text-xs px-2 py-1 rounded"
                                style={{
                                  backgroundColor: "var(--color-secondary)",
                                  color: "var(--color-secondary-content)",
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    {enhancedUserData.customField1 && (
                      <div>
                        <span className="text-sm font-bold text-gray-700">
                          Custom Field 1
                        </span>
                        <p className="text-gray-800">
                          {enhancedUserData.customField1}
                        </p>
                      </div>
                    )}
                    {enhancedUserData.customField2 && (
                      <div>
                        <span className="text-sm font-bold text-gray-700">
                          Custom Field 2
                        </span>
                        <p className="text-gray-800">
                          {enhancedUserData.customField2}
                        </p>
                      </div>
                    )}
                    {enhancedUserData.notes && (
                      <div>
                        <span className="text-sm font-bold text-gray-700">
                          Notes
                        </span>
                        <p className="text-gray-800 mt-1">
                          {enhancedUserData.notes}
                        </p>
                      </div>
                    )}

                    {/* Buttons below all field content */}
                    <div className="flex gap-2 pt-8 ">
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${localStorage.getItem("google_sheets_id")}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-2 rounded hover:opacity-90 transition-opacity flex items-center gap-1"
                        style={{
                          backgroundColor: "var(--color-success)",
                          color: "var(--color-success-content)",
                          textDecoration: "none",
                        }}
                      >
                        <span>📊 Info from Google Sheets</span>
                        <span>→</span>
                      </a>
                      {enhancedUserData.matchType === "fuzzy" && (
                        <span
                          className="text-xs px-3 py-2 rounded flex items-center"
                          style={{
                            backgroundColor: "var(--color-warning)",
                            color: "var(--color-warning-content)",
                          }}
                        >
                          ~Fuzzy Match
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">
                    No additional profile information available. Check the name
                    to make sure there's not a mismatch
                  </p>
                )}
              </div>
            </div>

            {/* Right Content - Posts Section */}
            <div className="lg:col-span-2">
              <h2
                className="text-2xl font-semibold mb-4"
                style={{ color: "var(--color-primary)" }}
              >
                Posts
              </h2>

              {loading ? (
                <LoadingSpinner message="Loading posts..." />
              ) : error ? (
                <ErrorMessage
                  message={error}
                  onRetry={() => window.location.reload()}
                />
              ) : posts.length === 0 ? (
                <div className="text-gray-500 text-lg">
                  No posts found for this user.
                </div>
              ) : (
                (() => {
                  // Organize posts and replies
                  const { topLevelPosts, repliesByParentId } =
                    organizePostsAndReplies(posts);

                  // Sort top-level posts by creation date
                  return topLevelPosts
                    .slice()
                    .sort(
                      (a, b) => new Date(a.created_at) - new Date(b.created_at)
                    )
                    .map((post, idx) => (
                      <div key={post.id}>
                        <div
                          className="px-4 my-6"
                          style={{
                            borderLeft: "3px solid var(--color-secondary)",
                          }}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <h3
                              className="text-xl font-semibold"
                              style={{ color: "var(--color-primary)" }}
                            >
                              {post.topic_title}
                            </h3>
                            {post.assignment_id &&
                              post.user_id &&
                              courseId &&
                              assignmentsMap[post.assignment_id]
                                ?.points_possible > 0 && (
                                <a
                                  href={`${apiUrl.replace("/api/v1", "")}courses/${courseId}/gradebook/speed_grader?assignment_id=${post.assignment_id}&student_id=${post.user_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-2 py-1 transition hover:opacity-90"
                                  style={{
                                    backgroundColor: post._isUngraded
                                      ? "var(--color-error)"
                                      : "var(--color-success)",
                                    color: post._isUngraded
                                      ? "var(--color-error-content)"
                                      : "var(--color-success-content)",
                                    borderRadius: "var(--radius-field)",
                                  }}
                                  title={
                                    post._isUngraded
                                      ? "Needs Grading"
                                      : "Graded"
                                  }
                                >
                                  SpeedGrader
                                </a>
                              )}
                          </div>
                          <div className="text-gray-500 text-xs mb-2">
                            {post.created_at
                              ? new Date(post.created_at).toLocaleString()
                              : ""}
                          </div>
                          <div
                            className="prose max-w-none mb-4"
                            dangerouslySetInnerHTML={{
                              __html: DOMPurify.sanitize(post.message),
                            }}
                          />
                          {post.score !== undefined && (
                            <div className="text-sm text-gray-600">
                              <p>Score: {post.score}</p>
                            </div>
                          )}
                        </div>

                        {/* Render replies */}
                        {repliesByParentId[post.id]?.map((reply, replyIdx) => (
                          <div
                            key={reply.id}
                            className="ml-8 border-l-4 pl-4 mb-4"
                            style={{ borderColor: "var(--color-primary)" }}
                          >
                            <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                              <div className="flex justify-between items-center mb-2">
                                <div>
                                  <span
                                    className="text-sm font-medium"
                                    style={{ color: "var(--color-primary)" }}
                                  >
                                    {reply.user?.display_name ||
                                      reply.user_name}
                                  </span>
                                  <span
                                    className="text-xs ml-2"
                                    style={{
                                      color: "var(--color-neutral-content)",
                                    }}
                                  >
                                    {new Date(
                                      reply.created_at
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                              <div
                                className="prose max-w-none"
                                dangerouslySetInnerHTML={{
                                  __html: DOMPurify.sanitize(reply.message),
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ));
                })()
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    </Layout>
  );
}

// This component handles the UI and logic for claiming a student
function StudentClaimStatus({ studentId, studentName }) {
  const [facilitatorName, setFacilitatorName] = useState("");

  useEffect(() => {
    const name = localStorage.getItem("facilitator_name") || "";
    setFacilitatorName(name);
  }, []);

  // Skip query if studentId is not yet available
  const status = useQuery(
    api.canvas.getStudentStatus,
    studentId ? { studentId: String(studentId) } : "skip"
  );

  const setStatus = useMutation(api.canvas.setStudentStatus);

  if (!studentId) {
    return <div className="min-h-[34px]"></div>; // Reserve space while loading studentId
  }

  function handleClaim() {
    if (!facilitatorName) {
      alert("Please set your name in the Settings page to claim students.");
      return;
    }
    setStatus({
      studentId: String(studentId),
      studentName: studentName,
      status: "claimed",
      facilitatorName: facilitatorName,
    });
  }

  function handleComplete() {
    setStatus({
      studentId: String(studentId),
      studentName: studentName,
      status: "completed",
      facilitatorName: facilitatorName,
    });
  }

  function handleUnclaim() {
    setStatus({
      studentId: String(studentId),
      studentName: studentName,
      status: null,
    });
  }

  const renderContent = () => {
    if (status === undefined) {
      return <div className="text-sm text-gray-500">Loading status...</div>;
    }

    if (status === null) {
      return (
        <button
          onClick={handleClaim}
          className="px-3 py-1 text-sm font-semibold rounded-md hover:opacity-90 transition-opacity"
          style={{
            backgroundColor: "var(--color-info)",
            color: "var(--color-info-content)",
          }}
        >
          Claim Student
        </button>
      );
    }

    if (status.status === "claimed") {
      return (
        <div className="flex items-center gap-3">
          <span
            className="px-3 py-1 text-sm font-semibold rounded-md"
            style={{
              backgroundColor: "var(--color-warning)",
              color: "var(--color-warning-content)",
            }}
          >
            Claimed by: {status.facilitatorName}
          </span>
          {status.facilitatorName === facilitatorName && (
            <>
              <button
                onClick={handleComplete}
                className="px-3 py-1 text-sm font-semibold rounded-md hover:opacity-90 transition-opacity"
                style={{
                  backgroundColor: "var(--color-success)",
                  color: "var(--color-success-content)",
                }}
              >
                Mark as Complete
              </button>
              <button
                onClick={handleUnclaim}
                className="px-3 py-1 text-sm font-semibold rounded-md hover:opacity-90 transition-opacity"
                style={{
                  backgroundColor: "var(--color-neutral)",
                  color: "var(--color-neutral-content)",
                }}
              >
                Unclaim
              </button>
            </>
          )}
        </div>
      );
    }

    if (status.status === "completed") {
      return (
        <div className="flex items-center gap-3">
          <span
            className="px-3 py-1 text-sm font-semibold rounded-md"
            style={{
              backgroundColor: "var(--color-success)",
              color: "var(--color-success-content)",
            }}
          >
            Completed by: {status.facilitatorName}
          </span>
          {status.facilitatorName === facilitatorName && (
            <button
              onClick={handleUnclaim}
              className="px-3 py-1 text-sm font-semibold rounded-md hover:opacity-90 transition-opacity"
              style={{
                backgroundColor: "var(--color-neutral)",
                color: "var(--color-neutral-content)",
              }}
            >
              Reset Status
            </button>
          )}
        </div>
      );
    }
    return null;
  };

  return <div className="min-h-[34px]">{renderContent()}</div>;
}
