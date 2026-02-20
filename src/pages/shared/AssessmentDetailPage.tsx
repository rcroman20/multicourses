// src/pages/AssessmentDetailPage.tsx - VERSIÓN CON DISEÑO JUVENIL MODERNO (COMPLETA)
import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademic } from '@/contexts/AcademicContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { assessmentService } from '@/lib/services/assessmentService';
import { gradeSheetService } from '@/lib/services/gradeSheetService';
import { notificationService } from '@/lib/services/notificationService';
import { submissionService, type CreateSubmissionData, type UpdateSubmissionData } from '@/lib/services/submissionService';
import { firebaseDB } from '@/lib/firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
  where,
} from 'firebase/firestore';
import { toast } from 'sonner';
import { useRef } from 'react'
import {
  ArrowLeft,
  Calendar,
  FileText, BookMarked, Globe, LinkIcon, FileQuestion, FileCode,
  Users,
  BarChart3,
  Clock,
  Percent,
  TrendingUp,
  CheckCircle, 
  XCircle,
  AlertCircle,
  Edit,
  Download,
  Eye,
  EyeOff,
  FileCheck,
  BookOpen,
  Presentation,
  Target,
  FileSpreadsheet,
  Award,
  Info,
  CalendarDays,
  ClipboardCheck,
  Timer,
  CalendarClock,
  ShieldCheck,
  MessageSquare,
  ExternalLink,
  ChevronRight,
  Star,
  Trophy,
  LineChart,
  PieChart,
  Activity,
  FileUp,
  Upload,
  Send,
  Save,
  Trash2,
  Lock,
  Unlock,
  CalendarCheck,
  AlertTriangle,
  Text,
  Type,
  FileEdit,
  X,
  Plus,
  File,
  Sparkles,
  Zap,
  Rocket,
  Target as TargetIcon,
  Bell,
  Bookmark,
  FileBarChart,
  FileBox,
  Megaphone,
  FileImage,
  Video,
  Paperclip,
  Download as DownloadIcon,
  ExternalLink as ExternalLinkIcon,
  CheckSquare,
  Hash
} from 'lucide-react';
import { format, parseISO, isBefore, isAfter, differenceInHours, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';

interface ForumComment {
  id: string;
  assessmentId: string;
  courseId: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string;
  userAvatarEmoji?: string;
  content: string;
  parentCommentId?: string;
  likedBy?: string[];
  dislikedBy?: string[];
  createdAt?: Date;
  pending?: boolean;
}

interface CommentUserProfile {
  avatarUrl?: string;
  avatarEmoji?: string;
  name?: string;
}

function resolveForumDisplayName(storedName?: string, profileName?: string): string {
  const normalizedStored = String(storedName || "").trim();
  const normalizedProfile = String(profileName || "").trim();

  // Old comments may contain generic placeholders like "User"/"Usuario".
  if (!normalizedStored || /^(user|usuario)$/i.test(normalizedStored)) {
    return normalizedProfile || "Usuario";
  }

  return normalizedStored;
}

function toSafeDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value && "toDate" in (value as any)) {
    try {
      const parsed = (value as any).toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function safeFormatDateTime(value: unknown, pattern = "dd/MM/yyyy HH:mm", fallback = "Just now"): string {
  const date = toSafeDate(value);
  if (!date) return fallback;
  try {
    return format(date, pattern);
  } catch {
    return fallback;
  }
}

function sanitizeRichTextHtml(input: string): string {
  if (!input?.trim()) return "";

  const decodeEntities = (value: string) => {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  };

  const decodedInput = decodeEntities(input);
  const sourceHtml = /<[^>]+>/.test(decodedInput) ? decodedInput : input;

  const parser = new DOMParser();
  const doc = parser.parseFromString(sourceHtml, "text/html");
  const allowedTags = new Set([
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "ul",
    "ol",
    "li",
    "pre",
    "code",
    "blockquote",
    "a",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ]);

  const cleanNode = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();

    if (!allowedTags.has(tag)) {
      const fragment = document.createDocumentFragment();
      while (element.firstChild) {
        fragment.appendChild(element.firstChild);
      }
      element.replaceWith(fragment);
      return;
    }

    for (const attr of Array.from(element.attributes)) {
      const attrName = attr.name.toLowerCase();
      if (attrName.startsWith("on") || attrName === "style") {
        element.removeAttribute(attr.name);
      }
    }

    if (tag === "a") {
      const href = (element.getAttribute("href") || "").trim();
      const isAllowedHref =
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("/") ||
        href.startsWith("#");

      if (!isAllowedHref) {
        element.removeAttribute("href");
      } else {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    } else {
      for (const attr of Array.from(element.attributes)) {
        element.removeAttribute(attr.name);
      }
    }

    if (tag === "ol") {
      element.style.listStyleType = "decimal";
      element.style.paddingLeft = "1.5rem";
    }

    if (tag === "ul") {
      element.style.listStyleType = "disc";
      element.style.paddingLeft = "1.5rem";
    }

    if (tag === "li") {
      element.style.display = "list-item";
    }

    Array.from(element.childNodes).forEach(cleanNode);
  };

  Array.from(doc.body.childNodes).forEach(cleanNode);

  // Remove empty block elements that create excessive vertical space.
  const blockSelectors = "p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre";
  doc.body.querySelectorAll(blockSelectors).forEach((element) => {
    const html = (element.innerHTML || "")
      .replace(/&nbsp;/gi, "")
      .replace(/<br\s*\/?>/gi, "")
      .trim();
    if (!html) {
      element.remove();
    }
  });

  // Collapse repeated line breaks.
  let normalizedHtml = doc.body.innerHTML.replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>");
  normalizedHtml = normalizedHtml.replace(/>\s+</g, "><").trim();
  return normalizedHtml;
}

export default function AssessmentDetailPage() {
  const { courseCode, assessmentId } = useParams<{ courseCode: string; assessmentId: string }>();
  const { user } = useAuth();
  const { courses } = useAcademic();
  const navigate = useNavigate();
  
  const [assessment, setAssessment] = useState<any>(null);
  const [gradeSheet, setGradeSheet] = useState<any>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllGrades, setShowAllGrades] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'grades' | 'analytics' | 'submission' | 'forum'>('overview');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [forumComments, setForumComments] = useState<ForumComment[]>([]);
  const [commentUserProfiles, setCommentUserProfiles] = useState<Record<string, CommentUserProfile>>({});
  const [forumMessage, setForumMessage] = useState('');
  const [postingForumComment, setPostingForumComment] = useState(false);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // Estados para entregas de estudiantes
  const [studentSubmission, setStudentSubmission] = useState<any>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingSubmission, setIsEditingSubmission] = useState(false);
const [submissionStatus, setSubmissionStatus] = useState<'draft' | 'submitted' | 'graded' | 'sent'>('draft');
  const [nowTs, setNowTs] = useState(Date.now());

  const course = courses.find(c => c.code === courseCode);
  const courseId = course ? course.id : null;
  const enrolledStudents = useMemo(() => {
    if (!Array.isArray((course as any)?.enrolledStudents)) return [] as Array<{ id: string; name?: string }>;
    return (course as any).enrolledStudents
      .map((entry: any) => {
        if (typeof entry === "string") return { id: entry, name: "" };
        return { id: String(entry?.id || ""), name: String(entry?.name || "") };
      })
      .filter((entry: { id: string }) => entry.id.length > 0);
  }, [(course as any)?.enrolledStudents]);
  const enrolledStudentIds = useMemo(() => enrolledStudents.map((student) => student.id), [enrolledStudents]);
  const isTeacher = user?.role === 'docente';
  const isStudent = user?.role === 'estudiante';
  const forumCloseAtDate = assessment?.forumCloseAt ? toSafeDate(assessment.forumCloseAt) : null;
  const isForumClosed = Boolean(
    assessment?.type === 'forum' &&
      forumCloseAtDate &&
      forumCloseAtDate.getTime() <= nowTs,
  );
  const visibleForumComments = useMemo(() => {
    if (forumComments.length === 0) return [];

    const childrenByParent = forumComments.reduce<Record<string, ForumComment[]>>((acc, comment) => {
      if (!comment.parentCommentId) return acc;
      if (!acc[comment.parentCommentId]) acc[comment.parentCommentId] = [];
      acc[comment.parentCommentId].push(comment);
      return acc;
    }, {});

    const roots = forumComments.filter((comment) => !comment.parentCommentId);
    const ordered: ForumComment[] = [];
    const visited = new Set<string>();

    const appendThread = (comment: ForumComment) => {
      if (visited.has(comment.id)) return;
      visited.add(comment.id);
      ordered.push(comment);
      (childrenByParent[comment.id] || []).forEach(appendThread);
    };

    roots.forEach(appendThread);
    return ordered;
  }, [forumComments]);
  const sanitizedAssessmentDescription = useMemo(
    () => sanitizeRichTextHtml(String(assessment?.description || "")),
    [assessment?.description],
  );
  const topLevelForumComments = useMemo(
    () => visibleForumComments.filter((comment) => !comment.parentCommentId),
    [visibleForumComments],
  );
  const forumRepliesByParent = useMemo(
    () =>
      visibleForumComments.reduce<Record<string, ForumComment[]>>((acc, comment) => {
        if (!comment.parentCommentId) return acc;
        if (!acc[comment.parentCommentId]) acc[comment.parentCommentId] = [];
        acc[comment.parentCommentId].push(comment);
        return acc;
      }, {}),
    [visibleForumComments],
  );
  const forumRequirements = useMemo(() => {
    const requirements = (assessment?.forumRequirements || {}) as any;
    return {
      mainResponseMinWords: Math.max(0, Number(requirements.mainResponseMinWords || 80)),
      peerRepliesRequired: Math.max(0, Number(requirements.peerRepliesRequired || 2)),
      peerReplyCommentsRequired: Math.max(0, Number(requirements.peerReplyCommentsRequired || 1)),
      mainResponsesRequired: Math.max(1, Number(requirements.mainResponsesRequired || 1)),
    };
  }, [assessment?.forumRequirements]);
  const forumComplianceStats = useMemo(() => {
    if (assessment?.type !== "forum") return null;

    const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
    const commentsById = new Map(visibleForumComments.map((comment) => [comment.id, comment]));
    const gradeStudentIds = grades
      .map((grade: any) => String(grade?.studentId || ""))
      .filter((id: string) => id.length > 0);
    const forumParticipantIds = Array.from(
      new Set(
        visibleForumComments
          .map((comment) => String(comment.userId || ""))
          .filter((id) => id.length > 0),
      ),
    );

    // Prefer enrolled students. Fallback to grade/comment participants when course data is incomplete.
    const fallbackStudentIds = Array.from(new Set([...gradeStudentIds, ...forumParticipantIds]));
    const baseStudentIds = enrolledStudentIds.length > 0 ? enrolledStudentIds : fallbackStudentIds;
    const teacherId = isTeacher ? String(user?.id || "") : "";
    const evaluatedStudentIds = baseStudentIds.filter((id) => id && id !== teacherId);

    const students = evaluatedStudentIds.map((studentId) => {
      const enrolledEntry = enrolledStudents.find((entry) => entry.id === studentId);
      const mainPosts = topLevelForumComments.filter((comment) => comment.userId === studentId);
      const mainPostWords = mainPosts.reduce((sum, comment) => sum + countWords(comment.content || ""), 0);

      const repliesToPeers = visibleForumComments.filter((comment) => {
        if (comment.userId !== studentId || !comment.parentCommentId) return false;
        const parent = commentsById.get(comment.parentCommentId);
        return Boolean(parent && parent.userId !== studentId);
      }).length;

      const commentsOnPeerReplies = visibleForumComments.filter((comment) => {
        if (comment.userId !== studentId || !comment.parentCommentId) return false;
        const parent = commentsById.get(comment.parentCommentId);
        return Boolean(parent && parent.parentCommentId && parent.userId !== studentId);
      }).length;

      const meetsMainPosts = mainPosts.length >= forumRequirements.mainResponsesRequired;
      const meetsMainWords = mainPostWords >= forumRequirements.mainResponseMinWords;
      const meetsPeerReplies = repliesToPeers >= forumRequirements.peerRepliesRequired;
      const meetsPeerReplyComments = commentsOnPeerReplies >= forumRequirements.peerReplyCommentsRequired;
      const isCompliant = meetsMainPosts && meetsMainWords && meetsPeerReplies && meetsPeerReplyComments;

      return {
        studentId,
        studentName:
          enrolledEntry?.name ||
          commentUserProfiles[studentId]?.name ||
          `Student ${studentId.slice(0, 8)}`,
        mainPosts: mainPosts.length,
        mainPostWords,
        repliesToPeers,
        commentsOnPeerReplies,
        meetsMainPosts,
        meetsMainWords,
        meetsPeerReplies,
        meetsPeerReplyComments,
        isCompliant,
      };
    });

    const compliantCount = students.filter((item) => item.isCompliant).length;
    const nonCompliantCount = students.length - compliantCount;

    return {
      students,
      totals: {
        totalStudents: students.length,
        compliantCount,
        nonCompliantCount,
      },
    };
  }, [assessment?.type, commentUserProfiles, enrolledStudentIds, enrolledStudents, forumRequirements, grades, isTeacher, topLevelForumComments, user?.id, visibleForumComments]);
  const studentForumProgress = useMemo(() => {
    if (!isStudent || !user?.id || !forumComplianceStats) return null;
    return (
      forumComplianceStats.students.find((item) => item.studentId === user.id) ||
      null
    );
  }, [forumComplianceStats, isStudent, user?.id]);

  const isForumClosedNow = () => {
    const closeAt = assessment?.forumCloseAt ? toSafeDate(assessment.forumCloseAt) : null;
    return Boolean(assessment?.type === 'forum' && closeAt && closeAt.getTime() <= Date.now());
  };

  useEffect(() => {
    if (courseCode && assessmentId && courseId) {
      loadAssessment();
      if (isStudent) {
        loadStudentSubmission();
      }
    }
  }, [courseCode, assessmentId, user?.id, courseId]);

  useEffect(() => {
    if (assessment?.type !== 'forum' || !assessment?.forumCloseAt) return;
    const intervalId = window.setInterval(() => {
      setNowTs(Date.now());
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [assessment?.type, assessment?.forumCloseAt]);

  useEffect(() => {
  if (textAreaRef.current && submissionText) {
    textAreaRef.current.style.height = 'auto';
    textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 400)}px`;
  }
}, [submissionText]);

  useEffect(() => {
    if (!assessmentId || !courseId || assessment?.type !== 'forum') {
      setForumComments([]);
      return;
    }

    const forumQuery = query(
      collection(firebaseDB, 'assessmentForumComments'),
      where('assessmentId', '==', assessmentId),
      where('courseId', '==', courseId),
    );

    const unsubscribe = onSnapshot(
      forumQuery,
      (snapshot) => {
        const comments = snapshot.docs
          .map((commentDoc) => {
            const data = commentDoc.data() as any;
            return {
              id: commentDoc.id,
              assessmentId: String(data.assessmentId || ''),
              courseId: String(data.courseId || ''),
              userId: String(data.userId || ''),
              userName: String(data.userName || ''),
              userAvatarUrl: String(data.userAvatarUrl || ''),
              userAvatarEmoji: String(data.userAvatarEmoji || ''),
              content: String(data.content || ''),
              parentCommentId: String(data.parentCommentId || ''),
              likedBy: Array.isArray(data.likedBy) ? data.likedBy : [],
              dislikedBy: Array.isArray(data.dislikedBy) ? data.dislikedBy : [],
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
              pending: false,
            } as ForumComment;
          })
          .sort((a, b) => {
            const aTime = a.createdAt ? a.createdAt.getTime() : 0;
            const bTime = b.createdAt ? b.createdAt.getTime() : 0;
            return aTime - bTime;
          });

        setForumComments(comments);
      },
      () => {
        toast.error('Could not load forum comments (permissions/rules).');
      },
    );

    return () => unsubscribe();
  }, [assessment?.type, assessmentId, courseId]);

  useEffect(() => {
    if (assessment?.type === 'forum') {
      setActiveTab('forum');
    }
  }, [assessment?.type]);

  useEffect(() => {
    const forumUserIds = visibleForumComments
      .map((comment) => comment.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const gradeUserIds = grades
      .map((grade: any) => grade?.studentId)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

    const uniqueUserIds = Array.from(new Set([...forumUserIds, ...gradeUserIds, ...enrolledStudentIds]));

    const missingUserIds = uniqueUserIds.filter((id) => !commentUserProfiles[id]);
    if (missingUserIds.length === 0) return;

    let cancelled = false;

    const loadMissingProfiles = async () => {
      const entries = await Promise.all(
        missingUserIds.map(async (userId) => {
          try {
            const userSnap = await getDoc(doc(firebaseDB, 'usuarios', userId));
            if (userSnap.exists()) {
              const data = userSnap.data() as any;
              return [
                userId,
                {
                  avatarUrl: String(data?.avatarUrl || ''),
                  avatarEmoji: String(data?.avatarEmoji || ''),
                  name: String(data?.name || ''),
                },
              ] as const;
            }

            const studentSnap = await getDoc(doc(firebaseDB, 'estudiantes', userId));
            if (studentSnap.exists()) {
              const data = studentSnap.data() as any;
              return [
                userId,
                {
                  avatarUrl: String(data?.avatarUrl || ''),
                  avatarEmoji: String(data?.avatarEmoji || ''),
                  name: String(data?.name || ''),
                },
              ] as const;
            }
          } catch {
            // Best effort fallback.
          }

          return [userId, {}] as const;
        }),
      );

      if (cancelled) return;

      setCommentUserProfiles((prev) => {
        const next = { ...prev };
        entries.forEach(([userId, profile]) => {
          next[userId] = profile;
        });
        return next;
      });
    };

    void loadMissingProfiles();

    return () => {
      cancelled = true;
    };
  }, [visibleForumComments, grades, commentUserProfiles, enrolledStudentIds]);

const loadAssessment = async () => {
  setLoading(true);
  try {
    const assessmentData = await assessmentService.getAssessmentById(assessmentId!);
    
    if (!assessmentData) {
      setAssessment(null);
      return;
    }
    
    console.log('🎯 Assessment data loaded:', assessmentData);
    console.log('📊 Max points:', assessmentData.maxPoints);
    console.log('📝 Type:', assessmentData.type);
    
    setAssessment(assessmentData);
    await loadDynamicData(assessmentData);

    if (isTeacher && assessmentData.assessmentType !== 'announcement') {
      let sheetGradesData: any[] = [];
      let directGradesData: any[] = [];

      if (assessmentData.gradeSheetId) {
        try {
          const sheet = await gradeSheetService.getById(assessmentData.gradeSheetId);
          setGradeSheet(sheet);

          if (sheet && sheet.students) {
            sheetGradesData = await extractGradesFromSheet(sheet, assessmentData);
          }
        } catch {
          setGradeSheet(null);
        }
      } else {
        setGradeSheet(null);
      }

      try {
        const rawDirectGrades = await assessmentService.getAssessmentGrades(assessmentId!);
        directGradesData = await Promise.all(
          rawDirectGrades.map(async (grade) => {
            let studentName = `Student ${grade.studentId?.slice(0, 8) || ""}`;
            let studentEmail = "";

            try {
              const [studentDoc, userDoc] = await Promise.all([
                getDoc(doc(firebaseDB, "estudiantes", grade.studentId)),
                getDoc(doc(firebaseDB, "usuarios", grade.studentId)),
              ]);
              const studentData = studentDoc.exists() ? (studentDoc.data() as any) : {};
              const userData = userDoc.exists() ? (userDoc.data() as any) : {};
              studentName = String(userData.name || studentData.name || studentName);
              studentEmail = String(userData.email || studentData.email || "");
            } catch {
              // Keep fallback values.
            }

            const score = Number(grade.value ?? 0);
            const maxScore = Number(assessmentData.maxPoints || 5);
            const percentage = maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(1)) : 0;

            return {
              id: grade.id,
              studentId: grade.studentId,
              studentName,
              studentEmail,
              score,
              maxScore,
              comment: String((grade as any).comment || grade.feedback || ""),
              status: "graded",
              gradedAt: grade.gradedAt || new Date(),
              percentage,
            };
          }),
        );
      } catch {
        directGradesData = [];
      }

      const mergedMap = new Map<string, any>();
      sheetGradesData.forEach((item) => {
        if (item?.studentId) mergedMap.set(item.studentId, item);
      });
      directGradesData.forEach((item) => {
        if (!item?.studentId) return;
        const existing = mergedMap.get(item.studentId);
        if (!existing || existing.score === null || existing.score === undefined) {
          mergedMap.set(item.studentId, item);
        } else if (
          item.gradedAt &&
          existing.gradedAt &&
          new Date(item.gradedAt).getTime() > new Date(existing.gradedAt).getTime()
        ) {
          mergedMap.set(item.studentId, item);
        }
      });

      const mergedGrades = Array.from(mergedMap.values());
      console.log('📈 Grades merged:', mergedGrades.length);
      setGrades(mergedGrades);
      calculateStats(mergedGrades);
    } else {
      setGradeSheet(null);
      setGrades([]);
      calculateStats([]);
    }
  } catch (error) {
    toast.error('Error al cargar los datos de la evaluación');
    setAssessment(null);
  } finally {
    setLoading(false);
  }
};

const loadStudentSubmission = async () => {
  try {
    if (!user?.id || !assessmentId || !courseId) return;
    
    const submission = await submissionService.getSubmissionByStudentAndAssessment(user.id, assessmentId);
    if (submission) {
      setStudentSubmission(submission);
      setSubmissionText(submission.content || '');
      
      // Type assertion para manejar 'sent'
      const status = submission.status as 'draft' | 'submitted' | 'graded' | 'sent';
      
      if (status === 'sent') {
        setSubmissionStatus('sent');
      } else if (status === 'submitted' || status === 'graded' || status === 'draft') {
        setSubmissionStatus(status);
      } else {
        setSubmissionStatus('draft');
      }
    }
  } catch (error) {
  }
};

  const loadDynamicData = async (assessmentData: any) => {
    try {
      if (assessmentData.metadata) {
        const metadata = assessmentData.metadata;
        
        if (metadata.attachments && Array.isArray(metadata.attachments)) {
          setAttachments(metadata.attachments);
        } else if (assessmentData.attachmentUrls) {
          const formattedAttachments = assessmentData.attachmentUrls.map((url: string, index: number) => ({
            id: `attachment_${index}`,
            name: `Archivo ${index + 1}`,
            url: url,
            type: getFileTypeFromUrl(url),
            uploadedAt: new Date().toISOString()
          }));
          setAttachments(formattedAttachments);
        }

        if (metadata.instructions && Array.isArray(metadata.instructions)) {
          setInstructions(metadata.instructions);
        } else if (assessmentData.instructionsText) {
          const extractedInstructions = extractInstructionsFromText(assessmentData.instructionsText, assessmentData.type);
          setInstructions(extractedInstructions);
        } else if (assessmentData.description) {
          const extractedInstructions = extractInstructionsFromText(assessmentData.description, assessmentData.type);
          setInstructions(extractedInstructions);
        } else {
          const defaultInstructions = generateDefaultInstructions(assessmentData);
          setInstructions(defaultInstructions);
        }
      } else {
        if (assessmentData.description) {
          const extractedInstructions = extractInstructionsFromText(assessmentData.description, assessmentData.type);
          setInstructions(extractedInstructions);
        } else {
          const defaultInstructions = generateDefaultInstructions(assessmentData);
          setInstructions(defaultInstructions);
        }

        if (assessmentData.attachments) {
          setAttachments(assessmentData.attachments);
        }
      }
    } catch (error) {
      const defaultInstructions = generateDefaultInstructions(assessmentData);
      setInstructions(defaultInstructions);
    }
  };

const canSubmit = () => {
  if (!assessment) return false;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  if (assessment.assessmentType !== 'delivery') {
    return false;
  }
  
  if (assessment.deliveryType !== 'text') {
    toast.error('This activity does not accept text submissions');
    return false;
  }
  
  // Verificar fecha de inicio
  if (assessment.startDate) {
    const [startYear, startMonth, startDay] = assessment.startDate.split('-').map(Number);
    const startDateLocal = new Date(startYear, startMonth - 1, startDay);
    const startDiffDays = Math.floor((startDateLocal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (startDiffDays > 0) {
      toast.error('The activity has not yet started');
      return false;
    }
  }
  
  // Verificar fecha límite
  if (assessment.dueDate) {
    const [dueYear, dueMonth, dueDay] = assessment.dueDate.split('-').map(Number);
    const dueDateLocal = new Date(dueYear, dueMonth - 1, dueDay);
    const dueDiffDays = Math.floor((dueDateLocal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (dueDiffDays < 0) {
      toast.error('The submission deadline has passed');
      return false;
    }
  }
  
  return true;
};

const canEditSubmission = () => {
  if (!studentSubmission || !assessment) return false;
  
  const now = new Date();
  const deadline = assessment.dueDate ? new Date(assessment.dueDate) : null;
  
  return studentSubmission.status === 'draft' && 
         (!deadline || isBefore(now, deadline)) &&
         submissionStatus !== 'graded' &&
         submissionStatus !== 'sent' && // Añadir esta condición
         submissionStatus !== 'submitted'; // Y esta también
};

const canDeleteSubmission = () => {
  if (!studentSubmission || !assessment) return false;
  
  const now = new Date();
  const deadline = assessment.dueDate ? new Date(assessment.dueDate) : null;
  
  return studentSubmission.status === 'draft' && 
         (!deadline || isBefore(now, deadline));
};

  const handleSaveDraft = async () => {
    if (!canSubmit()) {
      toast.error('No puedes guardar la entrega en este momento');
      return;
    }

    if (!submissionText.trim()) {
      toast.error('La respuesta no puede estar vacía');
      return;
    }

    setIsSubmitting(true);
    try {
      const submissionData: CreateSubmissionData = {
        studentId: user?.id!,
        assessmentId: assessmentId!,
        courseId: courseId!,
        content: submissionText,
        status: 'draft',
        wordCount: submissionText.trim().split(/\s+/).length,
        characterCount: submissionText.length
      };

      let result;
      if (studentSubmission) {
        result = await submissionService.updateSubmission(studentSubmission.id!, {
          content: submissionText,
          status: 'draft',
          wordCount: submissionText.trim().split(/\s+/).length,
          characterCount: submissionText.length
        } as UpdateSubmissionData);
      } else {
        result = await submissionService.createSubmission(submissionData);
      }

      setStudentSubmission(result);
      setSubmissionStatus('draft');
      toast.success('Borrador guardado correctamente');
      setIsEditingSubmission(false);
    } catch (error) {
      toast.error('Error al guardar el borrador');
    } finally {
      setIsSubmitting(false);
    }
  };

const handleSubmit = async () => {
  if (!canSubmit()) {
    toast.error('No puedes enviar la entrega en este momento');
    return;
  }

  if (!submissionText.trim()) {
    toast.error('La respuesta no puede estar vacía');
    return;
  }

  setIsSubmitting(true);
  try {
    const submissionData = {
      studentId: user?.id!,
      assessmentId: assessmentId!,
      courseId: courseId!,
      content: submissionText,
      status: 'submitted' as const, // O 'sent' si quieres usar ese
      wordCount: submissionText.trim().split(/\s+/).length,
      characterCount: submissionText.length
    };

    let result;
    if (studentSubmission) {
      result = await submissionService.updateSubmission(studentSubmission.id!, {
        content: submissionText,
        status: 'submitted' as const, // O 'sent' si prefieres
        wordCount: submissionText.trim().split(/\s+/).length,
        characterCount: submissionText.length
      });
    } else {
      result = await submissionService.createSubmission(submissionData);
    }

    setStudentSubmission(result);
    // Aquí puedes decidir si usar 'submitted' o 'sent'
    setSubmissionStatus('submitted'); // O 'sent'
    toast.success('¡Entrega enviada correctamente!');
    setIsEditingSubmission(false);
  } catch (error) {
    toast.error('Error al enviar la entrega');
  } finally {
    setIsSubmitting(false);
  }
};

  const handleDeleteSubmission = async () => {
    if (!canDeleteSubmission()) {
      toast.error('No puedes eliminar esta entrega');
      return;
    }

    if (!confirm('¿Estás seguro de que deseas eliminar esta entrega? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      await submissionService.deleteSubmission(studentSubmission.id);
      setStudentSubmission(null);
      setSubmissionText('');
      setSubmissionStatus('draft');
      toast.success('Entrega eliminada correctamente');
    } catch (error) {
      toast.error('Error al eliminar la entrega');
    }
  };

  const handleStartEditing = () => {
    if (canEditSubmission()) {
      setIsEditingSubmission(true);
    } else {
      toast.error('No puedes editar esta entrega');
    }
  };

  const handlePublishForumComment = async (parentCommentId?: string) => {
    if (!assessmentId || !courseId || !user?.id) return;
    if (isForumClosedNow()) {
      toast.error("This forum is closed. New comments are no longer allowed.");
      return;
    }

    const isReplyTarget = typeof parentCommentId === "string" && parentCommentId.length > 0;
    const draftMessage = isReplyTarget ? (replyDrafts[parentCommentId] || "") : forumMessage;
    if (!draftMessage.trim()) {
      toast.error("Write a comment before publishing.");
      return;
    }

    const trimmedMessage = draftMessage.trim();
    const optimisticComment: ForumComment = {
      id: `temp-${Date.now()}`,
      assessmentId,
      courseId,
      userId: user.id,
      userName: user.name || user.email || 'User',
      userAvatarUrl: user.avatarUrl || '',
      userAvatarEmoji: user.avatarEmoji || '',
      content: trimmedMessage,
      parentCommentId: isReplyTarget ? parentCommentId : '',
      likedBy: [],
      dislikedBy: [],
      createdAt: new Date(),
      pending: true,
    };

    setForumComments((prev) => [...prev, optimisticComment]);
    if (isReplyTarget) {
      setReplyDrafts((prev) => ({ ...prev, [parentCommentId]: '' }));
      setReplyingToCommentId(null);
    } else {
      setForumMessage('');
    }
    setPostingForumComment(true);
    try {
      await addDoc(collection(firebaseDB, 'assessmentForumComments'), {
        assessmentId,
        courseId,
        userId: user.id,
        userName: user.name || user.email || 'User',
        userAvatarUrl: user.avatarUrl || '',
        userAvatarEmoji: user.avatarEmoji || '',
        content: trimmedMessage,
        parentCommentId: isReplyTarget ? parentCommentId : '',
        likedBy: [],
        dislikedBy: [],
        createdAt: serverTimestamp(),
      });

      const actorName = user.name || user.email || "A user";
      const forumLink = `/courses/${courseCode}/assessments/${assessmentId}`;
      const isReply = isReplyTarget;

      if (course?.teacherId && course.teacherId !== user.id) {
        try {
          await notificationService.createNotification(course.teacherId, {
            title: isReply ? "New forum reply" : "New forum comment",
            message: isReply
              ? `${actorName} replied in "${assessment.name}".`
              : `${actorName} commented in "${assessment.name}".`,
            type: "info",
            link: forumLink,
          });
        } catch {
          // Best effort notification.
        }
      }

      if (isReply && isReplyTarget) {
        const parentComment = forumComments.find((item) => item.id === parentCommentId);
        if (parentComment?.userId && parentComment.userId !== user.id) {
          try {
            await notificationService.createNotification(parentComment.userId, {
              title: "Someone replied to your comment",
              message: `${actorName} replied to you in "${assessment.name}".`,
              type: "info",
              link: forumLink,
            });
          } catch {
            // Best effort notification.
          }
        }
      }

      toast.success('Comment published');
    } catch (error) {
      setForumComments((prev) => prev.filter((comment) => comment.id !== optimisticComment.id));
      toast.error('Could not publish the comment');
    } finally {
      setPostingForumComment(false);
    }
  };

  const handleDeleteForumComment = async (commentId: string, commentUserId: string) => {
    if (!user?.id) return;
    if (!isTeacher && user.id !== commentUserId) return;

    const idsToDelete = (() => {
      if (!isTeacher) return [commentId];

      const childrenByParent = forumComments.reduce<Record<string, string[]>>((acc, comment) => {
        if (!comment.parentCommentId) return acc;
        if (!acc[comment.parentCommentId]) acc[comment.parentCommentId] = [];
        acc[comment.parentCommentId].push(comment.id);
        return acc;
      }, {});

      const ids = new Set<string>();
      const queue: string[] = [commentId];

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || ids.has(currentId)) continue;
        ids.add(currentId);
        (childrenByParent[currentId] || []).forEach((childId) => queue.push(childId));
      }

      return Array.from(ids);
    })();

    try {
      await Promise.all(idsToDelete.map((id) => deleteDoc(doc(firebaseDB, 'assessmentForumComments', id))));
      toast.success(idsToDelete.length > 1 ? 'Thread deleted' : 'Comment deleted');
    } catch (error) {
      toast.error('Could not delete comment');
    }
  };

  const handleToggleLike = async (comment: ForumComment) => {
    if (!user?.id) return;
    const isLiked = (comment.likedBy || []).includes(user.id);
    const isDisliked = (comment.dislikedBy || []).includes(user.id);
    const commentRef = doc(firebaseDB, 'assessmentForumComments', comment.id);

    try {
      if (isLiked) {
        await updateDoc(commentRef, {
          likedBy: arrayRemove(user.id),
        });
        return;
      }

      if (isDisliked) {
        await updateDoc(commentRef, {
          dislikedBy: arrayRemove(user.id),
        });
      }

      await updateDoc(commentRef, {
        likedBy: arrayUnion(user.id),
      });

      if (comment.userId !== user.id) {
        try {
          await notificationService.createNotification(comment.userId, {
            title: "New like on your comment",
            message: `${user.name || user.email || "A user"} liked your forum comment in "${assessment?.name || "Forum"}".`,
            type: "success",
            link: `/courses/${courseCode}/assessments/${assessmentId}`,
          });
        } catch {
          // Best effort notification.
        }
      }
    } catch {
      toast.error('Could not update reaction');
    }
  };

  const handleToggleDislike = async (comment: ForumComment) => {
    if (!user?.id) return;
    const isLiked = (comment.likedBy || []).includes(user.id);
    const isDisliked = (comment.dislikedBy || []).includes(user.id);
    const commentRef = doc(firebaseDB, 'assessmentForumComments', comment.id);

    try {
      if (isDisliked) {
        await updateDoc(commentRef, {
          dislikedBy: arrayRemove(user.id),
        });
        return;
      }

      if (isLiked) {
        await updateDoc(commentRef, {
          likedBy: arrayRemove(user.id),
        });
      }

      await updateDoc(commentRef, {
        dislikedBy: arrayUnion(user.id),
      });

      if (comment.userId !== user.id) {
        try {
          await notificationService.createNotification(comment.userId, {
            title: "New dislike on your comment",
            message: `${user.name || user.email || "A user"} disliked your forum comment in "${assessment?.name || "Forum"}".`,
            type: "warning",
            link: `/courses/${courseCode}/assessments/${assessmentId}`,
          });
        } catch {
          // Best effort notification.
        }
      }
    } catch {
      toast.error('Could not update reaction');
    }
  };
  

  const getFileTypeFromUrl = (url: string): string => {
    if (!url) return 'file';
    
    const extension = url.split('.').pop()?.toLowerCase();
    
    if (['pdf'].includes(extension || '')) return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) return 'image';
    if (['mp4', 'avi', 'mov', 'wmv'].includes(extension || '')) return 'video';
    if (['doc', 'docx'].includes(extension || '')) return 'document';
    if (['ppt', 'pptx'].includes(extension || '')) return 'presentation';
    if (['xls', 'xlsx'].includes(extension || '')) return 'spreadsheet';
    if (url.startsWith('http')) return 'link';
    
    return 'file';
  };

  const extractInstructionsFromText = (text: string, type: string) => {
    const instructions = [];
    
    if (!text) return instructions;
    
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('leer') || lowerText.includes('read') || 
        lowerText.includes('capítulo') || lowerText.includes('chapter') ||
        lowerText.includes('material') || lowerText.includes('book')) {
      const match = text.match(/[^.!?]*?(leer|read|capítulo|chapter|material|book)[^.!?]*[.!?]/i);
      instructions.push({
        id: 'study_material',
        type: 'study',
        icon: 'BookMarked',
        title: 'Material de Estudio',
        content: match ? match[0] : 'Revise los materiales de estudio asignados para esta evaluación.',
        color: 'emerald'
      });
    }
    
    if (lowerText.includes('entregar') || lowerText.includes('submit') || 
        lowerText.includes('subir') || lowerText.includes('upload') ||
        lowerText.includes('enviar') || lowerText.includes('entrega')) {
      const match = text.match(/[^.!?]*?(entregar|submit|subir|upload|enviar|entrega)[^.!?]*[.!?]/i);
      instructions.push({
        id: 'submission',
        type: 'submission',
        icon: 'FileBarChart',
        title: getTypeName(type) === 'Exam' ? 'Instrucciones del Examen' : 
               getTypeName(type) === 'Project' ? 'Entrega del Proyecto' : 'Instrucciones de Entrega',
        content: match ? match[0] : getSubmissionGuidelines(type),
        color: 'blue'
      });
    }
    
    if (lowerText.includes('tiempo') || lowerText.includes('time') || 
        lowerText.includes('minutos') || lowerText.includes('minutes') ||
        lowerText.includes('duración') || lowerText.includes('duration')) {
      const match = text.match(/[^.!?]*?(tiempo|time|minutos|minutes|duración|duration)[^.!?]*[.!?]/i);
      instructions.push({
        id: 'time',
        type: 'time',
        icon: 'Timer',
        title: 'Tiempo y Duración',
        content: match ? match[0] : getTimeAllowed(type),
        color: 'purple'
      });
    }
    
    if (lowerText.includes('formato') || lowerText.includes('format') || 
        lowerText.includes('estructura') || lowerText.includes('structure')) {
      const match = text.match(/[^.!?]*?(formato|format|estructura|structure)[^.!?]*[.!?]/i);
      instructions.push({
        id: 'format',
        type: 'format',
        icon: 'FileText',
        title: 'Formato Requerido',
        content: match ? match[0] : 'Siga el formato especificado por el profesor.',
        color: 'indigo'
      });
    }
    
    if (lowerText.includes('evaluación') || lowerText.includes('evaluation') || 
        lowerText.includes('criterio') || lowerText.includes('criteria') ||
        lowerText.includes('calificación') || lowerText.includes('grading')) {
      const match = text.match(/[^.!?]*?(evaluación|evaluation|criterio|criteria|calificación|grading)[^.!?]*[.!?]/i);
      instructions.push({
        id: 'evaluation',
        type: 'evaluation',
        icon: 'Target',
        title: 'Criterios de Evaluación',
        content: match ? match[0] : 'Los criterios de evaluación se basan en la rúbrica proporcionada.',
        color: 'red'
      });
    }
    
    if (instructions.length === 0) {
      instructions.push({
        id: 'general',
        type: 'general',
        icon: 'ClipboardCheck',
        title: 'Instrucciones Generales',
        content: text.length > 150 ? text.substring(0, 150) + '...' : text,
        color: 'gray'
      });
    }
    
    return instructions;
  };

  const generateDefaultInstructions = (assessmentData: any) => {
    const typeName = getTypeName(assessmentData.type);
    
    return [
      {
        id: 'study_material',
        type: 'study',
        icon: 'BookMarked',
        title: 'Material de Estudio',
        content: `Revise los materiales relacionados con "${assessmentData.name}" antes de realizar la ${typeName.toLowerCase()}.`,
        color: 'emerald'
      },
      {
        id: 'submission',
        type: 'submission',
        icon: 'FileBarChart',
        title: typeName === 'Exam' ? 'Instrucciones del Examen' : 
               typeName === 'Project' ? 'Entrega del Proyecto' : 'Instrucciones de Entrega',
        content: getSubmissionGuidelines(assessmentData.type),
        color: 'blue'
      },
      {
        id: 'time',
        type: 'time',
        icon: 'Timer',
        title: 'Tiempo y Duración',
        content: getTimeAllowed(assessmentData.type),
        color: 'purple'
      },
      {
        id: 'evaluation',
        type: 'evaluation',
        icon: 'Target',
        title: 'Criterios de Evaluación',
        content: `Esta ${typeName.toLowerCase()} representa el ${assessmentData.percentage}% de la calificación final.`,
        color: 'red'
      },
      {
        id: 'integrity',
        type: 'integrity',
        icon: 'ShieldCheck',
        title: 'Integridad Académica',
        content: 'Este trabajo debe cumplir con las políticas de integridad académica de la institución.',
        color: 'amber'
      }
    ];
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'exam': return 'Exam';
      case 'quiz': return 'Quiz';
      case 'homework': return 'Homework';
      case 'project': return 'Project';
      case 'participation': return 'Participation';
      case 'forum': return 'Forum';
      case 'delivery': return 'Delivery';
      case 'announcement': return 'Announcement';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  const getSubmissionGuidelines = (type: string) => {
    switch (type) {
      case 'exam':
        return 'Complete todas las secciones del examen. Las respuestas deben ser claras y concisas.';
      case 'quiz':
        return 'Responda todas las preguntas dentro del tiempo límite establecido.';
      case 'homework':
        return 'Entregue el trabajo completo en formato PDF a través de la plataforma.';
      case 'project':
        return 'Entregue todos los componentes del proyecto según las especificaciones proporcionadas.';
      case 'participation':
        return 'La participación será evaluada basándose en la contribución durante las sesiones.';
      case 'forum':
        return 'Participa con comentarios claros, aporta ideas y responde con respeto a tus compañeros.';
      default:
        return 'Siga las instrucciones específicas proporcionadas por el profesor.';
    }
  };

  const getTimeAllowed = (type: string) => {
    const dueDateParsed = toSafeDate(assessment?.dueDate);
    const dueDate = dueDateParsed ? format(dueDateParsed, "d 'de' MMMM", { locale: es }) : 'la fecha establecida';
    
    switch (type) {
      case 'exam':
        return `El examen debe completarse en una sesión. Fecha límite: ${dueDate}.`;
      case 'quiz':
        return `El quiz tiene un límite de tiempo de 30 minutos. Disponible hasta: ${dueDate}.`;
      case 'homework':
        return `Fecha límite de entrega: ${dueDate}.`;
      case 'project':
        return `Fecha límite de entrega: ${dueDate}.`;
      case 'forum':
        return `Participación abierta hasta: ${dueDate}.`;
      default:
        return `Complete antes de: ${dueDate}.`;
    }
  };

  const getInstructionIcon = (iconName: string, color: string) => {
    const IconComponent = {
      BookMarked,
      FileBarChart,
      Timer,
      ShieldCheck,
      FileText,
      BookOpen,
      FileCheck,
      Presentation,
      Video,
      Globe,
      LinkIcon,
      FileUp,
      FileQuestion,
      FileCode,
      FileImage,
      Target,
      ClipboardCheck,
      Paperclip
    }[iconName] || BookMarked;
    
    return <IconComponent className={`h-6 w-6 text-${color}-600`} />;
  };

  const getColorClass = (color: string, type: 'bg' | 'border' | 'text' | 'ring') => {
    const colorClasses = {
      emerald: {
        bg: 'bg-emerald-100',
        border: 'border-blue-200',
        text: 'text-blue-600',
        ring: 'ring-emerald-500'
      },
      blue: {
        bg: 'bg-blue-100',
        border: 'border-blue-200',
        text: 'text-blue-600',
        ring: 'ring-blue-500'
      },
      purple: {
        bg: 'bg-blue-100',
        border: 'border-blue-200',
        text: 'text-blue-600',
        ring: 'ring-blue-500'
      },
      amber: {
        bg: 'bg-amber-100',
        border: 'border-gray-200',
        text: 'text-gray-600',
        ring: 'ring-amber-500'
      },
      red: {
        bg: 'bg-red-100',
        border: 'border-red-200',
        text: 'text-red-600',
        ring: 'ring-red-500'
      },
      green: {
        bg: 'bg-green-100',
        border: 'border-blue-200',
        text: 'text-blue-600',
        ring: 'ring-green-500'
      },
      indigo: {
        bg: 'bg-blue-100',
        border: 'border-blue-200',
        text: 'text-blue-600',
        ring: 'ring-blue-500'
      },
      pink: {
        bg: 'bg-pink-100',
        border: 'border-blue-200',
        text: 'text-blue-600',
        ring: 'ring-pink-500'
      },
      gray: {
        bg: 'bg-gray-100',
        border: 'border-gray-200',
        text: 'text-gray-600',
        ring: 'ring-gray-500'
      }
    };

    return colorClasses[color as keyof typeof colorClasses]?.[type] || colorClasses.emerald[type];
  };

const extractGradesFromSheet = async (sheet: any, assessment: any) => {
  const gradesList: any[] = [];
  
  if (!sheet.students || sheet.students.length === 0) {
    return gradesList;
  }

  const activity = sheet.activities?.find((act: any) => 
    act.name === assessment.name || 
    act.id === assessment.id ||
    act.assessmentId === assessmentId
  );

  if (!activity) {
    console.log('⚠️ No se encontró actividad en la hoja de calificaciones');
    return gradesList;
  }

  // DETERMINAR EL MAX SCORE
  let maxScore = 5; // Valor por defecto
  if (activity.maxScore && activity.maxScore > 0) {
    maxScore = activity.maxScore;
    console.log('✅ Usando maxScore de la actividad:', maxScore);
  } else if (assessment.maxPoints && assessment.maxPoints > 0) {
    maxScore = assessment.maxPoints;
    console.log('✅ Usando maxPoints del assessment:', maxScore);
  } else {
    console.log('⚠️ Usando valor por defecto para maxScore:', maxScore);
  }

  console.log('📊 Actividad encontrada:', activity);
  console.log('🎯 Max Score determinado:', maxScore);

  sheet.students.forEach((student: any) => {
    if (student.grades && student.grades[activity.id]) {
      const gradeData = student.grades[activity.id];
      const score = gradeData.value;
      
      // Calcular porcentaje correctamente
      let percentage = null;
      if (score !== undefined && maxScore > 0) {
        percentage = parseFloat(((score / maxScore) * 100).toFixed(1));
        console.log(`📊 ${student.name || student.studentId}: Score=${score}, Percentage=${percentage}%`);
      }
      
      gradesList.push({
        id: `${student.studentId}_${activity.id}`,
        studentId: student.studentId,
        studentName: student.name || `Student ${student.studentId.substring(0, 8)}`,
        studentEmail: student.email || '',
        score: score,
        maxScore: maxScore,
        comment: gradeData.comment || '',
        status: score !== undefined ? 'graded' : 'pending',
        gradedAt: gradeData.submittedAt?.toDate?.() || new Date(),
        activityId: activity.id,
        activityName: activity.name,
        percentage: percentage
      });
    } else {
      gradesList.push({
        id: `${student.studentId}_${activity.id}`,
        studentId: student.studentId,
        studentName: student.name || `Student ${student.studentId.substring(0, 8)}`,
        studentEmail: student.email || '',
        score: null,
        maxScore: maxScore,
        comment: '',
        status: 'pending',
        gradedAt: null,
        activityId: activity.id,
        activityName: activity.name,
        percentage: null
      });
    }
  });

  console.log('📈 Total de calificaciones extraídas:', gradesList.length);
  return gradesList;
};
const calculateStats = (gradesData: any[]) => {
  if (!gradesData || gradesData.length === 0) {
    setStats({
      total: 0,
      graded: 0,
      average: 0,
      highest: 0,
      lowest: 0,
      passingRate: 0,
      passingCount: 0,
      failingCount: 0,
      pending: 0,
      distribution: {
        excellent: 0,
        good: 0,
        average: 0,
        poor: 0,
        failing: 0
      }
    });
    return;
  }

  const gradedStudents = gradesData.filter(g => g.score !== null && g.score !== undefined);
  const scores = gradedStudents.map(g => g.score);
  
  if (scores.length === 0) {
    setStats({
      total: gradesData.length,
      graded: 0,
      average: 0,
      highest: 0,
      lowest: 0,
      passingRate: 0,
      passingCount: 0,
      failingCount: 0,
      pending: gradesData.length,
      distribution: {
        excellent: 0,
        good: 0,
        average: 0,
        poor: 0,
        failing: 0
      }
    });
    return;
  }

  const highest = Math.max(...scores);
  const lowest = Math.min(...scores);
  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  const passingScore = assessment?.passingScore || 0;
  
  // DETERMINAR EL MAX SCORE CORRECTAMENTE
  let maxScore = 5; // Valor por defecto para escala 0-5
  
  if (assessment?.maxPoints && assessment.maxPoints > 0) {
    maxScore = assessment.maxPoints;
    console.log('✅ Usando maxPoints de assessment:', maxScore);
  } else if (gradedStudents.length > 0 && gradedStudents[0].maxScore) {
    maxScore = gradedStudents[0].maxScore;
    console.log('✅ Usando maxScore del primer estudiante:', maxScore);
  } else {
    console.log('⚠️ Usando valor por defecto para maxScore:', maxScore);
  }
  
  console.log('📊 Scores:', scores);
  console.log('🎯 Max Score:', maxScore);
  console.log('📈 Passing Score:', passingScore);
  
  const distribution = {
    excellent: 0,
    good: 0,
    average: 0,
    poor: 0,
    failing: 0
  };

  gradedStudents.forEach(g => {
    // Usar el porcentaje si ya está calculado, o calcularlo
    let percentage;
    if (g.percentage !== null && g.percentage !== undefined) {
      percentage = parseFloat(g.percentage);
      console.log(`📊 Estudiante ${g.studentName}: Usando porcentaje almacenado: ${percentage}%`);
    } else {
      // Calcular porcentaje basado en el score
      const studentMaxScore = g.maxScore || maxScore;
      percentage = (g.score / studentMaxScore) * 100;
      console.log(`📊 Estudiante ${g.studentName}: Score=${g.score}, Max=${studentMaxScore}, Porcentaje=${percentage.toFixed(1)}%`);
    }
    
    // Clasificar basado en el porcentaje
    if (percentage >= 90) {
      distribution.excellent++;
      console.log(`✅ Clasificado como Excelente (${percentage.toFixed(1)}%)`);
    } else if (percentage >= 80) {
      distribution.good++;
      console.log(`✅ Clasificado como Bueno (${percentage.toFixed(1)}%)`);
    } else if (percentage >= 70) {
      distribution.average++;
      console.log(`✅ Clasificado como Aceptable (${percentage.toFixed(1)}%)`);
    } else if (percentage >= 60) {
      distribution.poor++;
      console.log(`✅ Clasificado como Regular (${percentage.toFixed(1)}%)`);
    } else {
      distribution.failing++;
      console.log(`✅ Clasificado como Necesita Mejorar (${percentage.toFixed(1)}%)`);
    }
  });

  const passingCount = gradedStudents.filter(g => g.score >= passingScore).length;
  const failingCount = gradedStudents.length - passingCount;
  const passingRate = gradedStudents.length > 0 ? (passingCount / gradedStudents.length) * 100 : 0;

  console.log('📊 Distribución final:', distribution);
  console.log('📈 Passing rate:', passingRate);

  setStats({
    total: gradesData.length,
    graded: gradedStudents.length,
    average: average.toFixed(1),
    highest: highest.toFixed(1),
    lowest: lowest.toFixed(1),
    passingRate: passingRate.toFixed(0),
    passingCount,
    failingCount,
    pending: gradesData.length - gradedStudents.length,
    distribution
  });
};

  const getStatusInfo = (status: string) => {
    if (!status) {
      return { 
        color: 'bg-blue-100 text-blue-800 border-blue-200', 
        icon: <Eye className="h-4 w-4" />, 
        label: 'Published',
        description: 'Esta evaluación está publicada y visible para los estudiantes'
      };
    }
    switch (status) {
      case 'draft':
        return { 
          color: 'bg-amber-100 text-gray-800 border-gray-200', 
          icon: <AlertCircle className="h-4 w-4" />, 
          label: 'Draft',
          description: 'Esta evaluación está en borrador y no es visible para los estudiantes'
        };
      case 'published':
        return { 
          color: 'bg-blue-100 text-blue-800 border-blue-200', 
          icon: <Eye className="h-4 w-4" />, 
          label: 'Published',
          description: 'Esta evaluación está publicada y visible para los estudiantes'
        };
      case 'graded':
        return { 
          color: 'bg-emerald-100 text-blue-800 border-blue-200', 
          icon: <CheckCircle className="h-4 w-4" />, 
          label: 'Graded',
          description: 'Todas las calificaciones han sido asignadas'
        };
              case 'sent':
        return { 
          color: 'bg-emerald-100 text-blue-800 border-blue-200', 
          icon: <CheckCircle className="h-4 w-4" />, 
          label: 'Sent',
          description: 'Todas las calificaciones han sido asignadas'
        };
      default:
        return { 
          color: 'bg-gray-100 text-gray-800 border-gray-200', 
          icon: <AlertCircle className="h-4 w-4" />, 
          label: status,
          description: 'Unknown status'
        };
    }
  };

const formatDate = (dateString: string) => {
  if (!dateString || dateString.trim() === '') {
    return 'No date defined';
  }
  
  try {
    // Parsear manualmente para evitar problemas de zona horaria
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    // Formatear en español
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
  } catch (error) {
    return dateString;
  }
};

const formatTime = (dateString: string) => {
  if (!dateString || dateString.trim() === '') {
    return '';
  }
  
  try {
    // Para fechas sin hora
    if (dateString.length === 10 && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return ''; // No mostrar hora si solo es fecha
    } else {
      // Tiene hora incluida
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return '';
      }
      
      // Verificar si realmente tiene hora (no es medianoche por defecto)
      const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
      if (!hasTime) {
        return ''; // No mostrar "00:00" si no tiene hora real
      }
      
      return format(date, "h:mm a"); // Inglés: "7:00 PM" (usa "h" en lugar de "hh" para no mostrar cero inicial)
    }
  } catch (error) {
    return '';
  }
};




  
// REEMPLAZAR LA FUNCIÓN getTimeRemaining CON ESTA VERSIÓN CORREGIDA:
const getTimeRemaining = (dueDate: string) => {
  if (!dueDate || dueDate.trim() === '') return 'No due date';
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Parsear fecha YYYY-MM-DD manualmente
  const [year, month, day] = dueDate.split('-').map(Number);
  const dueDateLocal = new Date(year, month - 1, day); // month es 0-indexed
  
  // IMPORTANTE: Comparar con <= en lugar de < para considerar "hoy" como válido
  const diffTime = dueDateLocal.getTime() - today.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    // Hoy es la fecha límite
    return 'Due today';
  } else if (diffDays > 0) {
    // Futuro
    if (diffDays === 1) {
      return 'Due in 1 day';
    } else {
      return `Due in ${diffDays} days`;
    }
  } else {
    // Pasado
    const daysAgo = Math.abs(diffDays);
    return `Expired ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`;
  }
};




  const handleExportGrades = () => {
    if (grades.length === 0) {
      toast.warning('There are no grades to export');
      return;
    }

    const csvContent = [
      ['Estudiante', 'Correo', 'Calificación', 'Porcentaje', 'Estado', 'Fecha', 'Comentario'],
      ...grades.map(g => [
        g.studentName,
        g.studentEmail,
        g.score || 'Pendiente',
        g.percentage ? `${g.percentage}%` : 'N/A',
        g.score === null ? 'Pendiente' : g.score >= (assessment?.passingScore || 0) ? 'Aprobado' : 'No aprobado',
        g.gradedAt ? safeFormatDateTime(g.gradedAt, 'dd/MM/yyyy', 'Pendiente') : 'Pendiente',
        g.comment || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `calificaciones_${assessment?.name?.replace(/\s+/g, '_') || 'evaluacion'}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Calificaciones exportadas correctamente');
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf': return <FileText className="h-5 w-5" />;
      case 'image': return <FileImage className="h-5 w-5" />;
      case 'video': return <Video className="h-5 w-5" />;
      case 'document': return <FileText className="h-5 w-5" />;
      case 'presentation': return <Presentation className="h-5 w-5" />;
      case 'spreadsheet': return <FileSpreadsheet className="h-5 w-5" />;
      case 'link': return <ExternalLinkIcon className="h-5 w-5" />;
      default: return <Paperclip className="h-5 w-5" />;
    }
  };

const getSubmissionStatusInfo = () => {
  if (!assessment || assessment.assessmentType !== 'delivery') {
    return { 
      status: 'not_delivery',
      message: 'This activity does not require a submission',
      canSubmit: false,
      canEdit: false,
      canDelete: false
    };
  }
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  let isNotStarted = false;
  if (assessment.startDate) {
    const [startYear, startMonth, startDay] = assessment.startDate.split('-').map(Number);
    const startDateLocal = new Date(startYear, startMonth - 1, startDay);
    const startDiffDays = Math.floor((startDateLocal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    isNotStarted = startDiffDays > 0;
  }
  
  let isPastDue = false;
  if (assessment.dueDate) {
    const [dueYear, dueMonth, dueDay] = assessment.dueDate.split('-').map(Number);
    const dueDateLocal = new Date(dueYear, dueMonth - 1, dueDay);
    const dueDiffDays = Math.floor((dueDateLocal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    isPastDue = dueDiffDays < 0;
  }
  
  if (isNotStarted) {
    return { 
      status: 'not_started',
      message: 'The activity has not yet started',
      canSubmit: false,
      canEdit: false,
      canDelete: false
    };
  }
  
  if (isPastDue) {
    return { 
      status: 'closed',
      message: 'The submission deadline has passed',
      canSubmit: false,
      canEdit: false,
      canDelete: false
    };
  }
  
  // Incluir 'sent' aquí
  if (submissionStatus === 'submitted' || submissionStatus === 'sent') {
    return { 
      status: 'submitted',
      message: 'Your submission has been sent',
      canSubmit: false,
      canEdit: false,
      canDelete: false
    };
  }
  
  if (submissionStatus === 'graded') {
    return { 
      status: 'graded',
      message: 'Your submission has been graded',
      canSubmit: false,
      canEdit: false,
      canDelete: false
    };
  }
  
  return { 
    status: 'open',
    message: 'The activity is open for submissions',
    canSubmit: true,
    canEdit: true,
    canDelete: studentSubmission?.status === 'draft'
  };
};


  // Función para obtener el color del tipo de evaluación (MODERNA)
  const getTypeColorModern = (type: string) => {
    switch (type) {
      case 'exam': return 'bg-red-100 text-red-700 border border-red-200';
      case 'quiz': return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'homework': return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'project': return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'participation': return 'bg-gray-100 text-gray-700 border border-gray-200';
      case 'forum': return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'delivery': return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'announcement': return 'bg-gray-100 text-gray-700 border border-gray-200';
      default: return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
  };

  // Función para obtener el ícono del tipo (MODERNO)
  const getTypeIconModern = (type: string) => {
    switch (type) {
      case 'exam': return <FileText className="h-4 w-4" />;
      case 'quiz': return <BookOpen className="h-4 w-4" />;
      case 'homework': return <FileCheck className="h-4 w-4" />;
      case 'project': return <TrendingUp className="h-4 w-4" />;
      case 'participation': return <Users className="h-4 w-4" />;
      case 'forum': return <MessageSquare className="h-4 w-4" />;
      case 'delivery': return <Upload className="h-4 w-4" />;
      case 'announcement': return <Megaphone className="h-4 w-4" />;
      default: return <File className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Loading Assessment...">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
            <div className="space-y-2">
              <p className="text-lg font-bold text-gray-900">Loading assessment details</p>
              <p className="text-sm text-gray-600">Preparing your personalized view</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!assessment || !course) {
    return (
      <DashboardLayout title="Assessment not found">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2 max-w-md">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-red-100 flex items-center justify-center border border-red-200">
              <AlertCircle className="h-10 w-10 text-red-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-gray-900">Assessment not found</h3>
              <p className="text-gray-600">
                The specified assessment does not exist or you do not have permission to access it.
              </p>
            </div>
            <Link
              to={`/courses/${courseCode}/assessments`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white hover:shadow-lg transition-all duration-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Assessments
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const dueDate = assessment.dueDate ? new Date(assessment.dueDate) : null;
  const startDate = assessment.startDate ? new Date(assessment.startDate) : null;
  const isPastDue = dueDate && isAfter(new Date(), dueDate);
  const isNotStarted = startDate && isBefore(new Date(), startDate);
  const displayType =
    assessment.assessmentType === 'announcement'
      ? 'announcement'
      : assessment.assessmentType === 'delivery'
      ? 'delivery'
      : assessment.type;
  const displayStatus =
    displayType === 'announcement'
      ? 'published'
      : assessment.status;
  const statusInfo = getStatusInfo(displayStatus);
  const displayedGrades = showAllGrades ? grades : grades.slice(0, 50);
  const timeRemaining = getTimeRemaining(assessment.dueDate);
  const typeName = getTypeName(displayType);
  const submissionStatusInfo = getSubmissionStatusInfo();

  return (
    <DashboardLayout
      title={`${assessment.name}`}
      subtitle={`${course.name} • ${course.code}`}
       contentClassName="pt-0 lg:pt-1"
    >
      <div className="space-y-2">
    

        {/* Tabs de navegación - DISEÑO MODERNO */}
        <div className="bg-white border border-gray-200 rounded-2xl p-2 shadow-sm">
          <nav className="flex space-x-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Info className="h-4 w-4" />
              Overview
            </button>

            {assessment.type === 'forum' && (
              <button
                onClick={() => setActiveTab('forum')}
                className={`px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
                  activeTab === 'forum'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                Forum ({visibleForumComments.length})
              </button>
            )}
            
            {isTeacher && assessment.assessmentType !== 'announcement' && grades.length > 0 && (
              <button
                onClick={() => setActiveTab('grades')}
                className={`px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
                  activeTab === 'grades'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Award className="h-4 w-4" />
                Grades ({grades.length})
              </button>
            )}
            
            {isTeacher && assessment.assessmentType !== 'announcement' && stats && (
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
                  activeTab === 'analytics'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </button>
            )}
            
            {isStudent && assessment.assessmentType === 'delivery' && (
              <button
                onClick={() => setActiveTab('submission')}
                className={`px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
                  activeTab === 'submission'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Upload className="h-4 w-4" />
                My Submission
                {studentSubmission && (
                  <span className={`ml-1 px-2 py-0.5 text-xs rounded-full font-bold ${
                    studentSubmission.status === 'submitted' 
                      ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                      : 'bg-gray-100 text-gray-800 border border-gray-200'
                  }`}>
                    {studentSubmission.status === 'submitted' ? 'Sent' : 'Sent'}
                  </span>
                )}
              </button>
            )}
          </nav>
        </div>

        {/* Contenido del Overview - DISEÑO MODERNO */}
        {activeTab === 'overview' && (
          <div className="space-y-2">
            {/* Tarjeta principal */}
            <div >
                 {/* Hoja de calificaciones (profesores) */}
            {isTeacher && assessment.gradeSheetId && gradeSheet && (
              <div className="modern-card mb-2">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-2">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                      Linked Grade Sheet
                    </h3>
                    <p className="text-gray-600">
                      This assessment is linked to a grade sheet for tracking results.
                    </p>
                  </div>
                  
                 
                </div>
                
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center shadow-sm">
                        <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-blue-600 font-bold">Grade Sheet</p>
                        <p className="font-bold text-gray-900 line-clamp-2 text-sm">{gradeSheet.title}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center shadow-sm">
                        <Award className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-blue-600 font-bold">Activities</p>
                        <p className="font-bold text-gray-900 text-sm">
                          {gradeSheet.activities?.length || 0} activities
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center shadow-sm">
                        <Users className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-blue-600 font-bold">Students</p>
                        <p className="font-bold text-gray-900 text-sm">
                          {gradeSheet.students?.length || 0} students
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Columna izquierda */}

                <div className="lg:col-span-2 space-y-2">
                  {/* Descripción */}
                  {assessment.description && (
                    <div className="modern-card">
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <FileBox className="h-5 w-5 text-blue-600" />
                        Description
                      </h3>
                      <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                        {sanitizedAssessmentDescription ? (
                          <div
                            dangerouslySetInnerHTML={{ __html: sanitizedAssessmentDescription }}
                          />
                        ) : null}
                        <p className="text-gray-700 leading-relaxed mt-4">
                          Review materials related to "{assessment.name}" before taking the {typeName.toLowerCase()}.
                        </p>
                      </div>

                    </div>
                    
                  )}



                 

                  {/* Estado de entrega para estudiantes */}
                  {isStudent && assessment.assessmentType === 'delivery' && (
                    <div className={`modern-card ${submissionStatusInfo.status === 'closed' ? 'border-red-200' : submissionStatusInfo.status === 'not_started' ? 'border-gray-200' : 'border-blue-200'}`}>
                      <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5 text-blue-600" />
                        Submission Instructions
                      </h3>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                            submissionStatusInfo.status === 'closed' 
                              ? 'bg-red-100 text-red-600' 
                              : submissionStatusInfo.status === 'not_started'
                              ? 'bg-gray-100 text-gray-600'
                              : 'bg-blue-100 text-blue-600'
                          }`}>
                            {submissionStatusInfo.status === 'closed' ? (
                              <Lock className="h-6 w-6" />
                            ) : submissionStatusInfo.status === 'not_started' ? (
                              <CalendarClock className="h-6 w-6" />
                            ) : (
                              <Upload className="h-6 w-6" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900">
                              {submissionStatusInfo.status === 'closed' 
                                ? 'Submission Closed' 
                                : submissionStatusInfo.status === 'not_started'
                                ? 'Not Started'
                                : 'Delivery Status'}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {submissionStatusInfo.message}
                            </p>
                          </div>
                        </div>
                        {submissionStatusInfo.canSubmit && (
                          <button
                            onClick={() => setActiveTab('submission')}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:shadow-lg transition-all duration-300"
                          >
                            <Upload className="h-4 w-4" />
                            Submit Now
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Columna derecha - Metadatos */}
                <div className="space-y-2">
                                    {/* Fechas importantes */}
                 
<div className="modern-card">
  <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
    <CalendarDays className="h-5 w-5 text-blue-600" />
   Important Dates
  </h3>
  <div className="space-y-2">
    {/* Fecha de inicio */}
    {assessment.assessmentType === 'delivery' && assessment.startDate && (
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Fecha de inicio</span>
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
            isNotStarted 
              ? 'bg-gray-100 text-gray-700' 
              : 'bg-blue-100 text-blue-700'
          }`}>
            {isNotStarted ? 'No Active' : 'Active'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-gray-900">
            {formatDate(assessment.startDate)}
          </span>
        </div>
        {formatTime(assessment.startDate) && (
          <p className="text-sm text-gray-500 mt-1 ml-6">
            Time: {formatTime(assessment.startDate)}
          </p>
        )}
      </div>
    )}
    
    {/* Fecha límite */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">Due Date</span>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
          isPastDue 
            ? 'bg-red-100 text-red-700' 
            : 'bg-blue-100 text-blue-700'
        }`}>
          {timeRemaining}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-blue-500" />
        <span className="font-medium text-gray-900">
          {formatDate(assessment.dueDate)}
        </span>
      </div>
      {formatTime(assessment.dueDate) && (
        <p className="text-sm text-gray-500 mt-1 ml-6">
          Time: {formatTime(assessment.dueDate)}
        </p>
      )}
    </div>
  </div>
</div>
                  {/* Información General */}
                 {/* Información General */}
<div className="modern-card">
  <h3 className="text-lg font-bold text-gray-900 mb-2">General Information</h3>
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-gray-600">Status</span>
      {isStudent && assessment.assessmentType === 'delivery' ? (
        // Mostrar estado de la entrega del estudiante
        <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
          submissionStatus === 'submitted' || submissionStatus === 'sent'
            ? 'bg-blue-100 text-blue-800 border border-blue-200'
            : submissionStatus === 'graded'
            ? 'bg-blue-100 text-blue-800 border border-blue-200'
            : submissionStatus === 'draft'
            ? 'bg-gray-100 text-gray-800 border border-gray-200'
            : 'bg-gray-100 text-gray-800 border border-gray-200'
        }`}>
          <span className="flex items-center gap-1.5">
            {submissionStatus === 'submitted' || submissionStatus === 'sent' ? (
              <CheckCircle className="h-4 w-4" />
            ) : submissionStatus === 'graded' ? (
              <Award className="h-4 w-4" />
            ) : submissionStatus === 'draft' ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <Info className="h-4 w-4" />
            )}
            {submissionStatus === 'submitted' || submissionStatus === 'sent' ? 'Sent' :
             submissionStatus === 'graded' ? 'Calificada' :
             submissionStatus === 'draft' ? 'Borrador' : 'Sin entregar'}
          </span>
        </span>
      ) : (
        // Mostrar estado general de la evaluación (para profesores o actividades no de entrega)
        <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${statusInfo.color}`}>
          <span className="flex items-center gap-1.5">
            {statusInfo.icon}
            {statusInfo.label}
          </span>
        </span>
      )}
    </div>
    
    <div className="flex items-center justify-between">
      <span className="text-gray-600">Type</span>
      <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${getTypeColorModern(displayType)}`}>
        <span className="flex items-center gap-1.5">
          {getTypeIconModern(displayType)}
          {typeName}
        </span>
      </span>
    </div>
    
    {assessment.assessmentType === 'delivery' && (
      <div className="flex items-center justify-between">
        <span className="text-gray-600">Submission Type</span>
        <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-blue-100 text-blue-700 border border-blue-200">
          <span className="flex items-center gap-1.5">
            <Text className="h-3 w-3" />
            Only Text
          </span>
        </span>
      </div>
    )}
    
    {assessment.percentage > 0 && (
      <div className="flex items-center justify-between">
        <span className="text-gray-600">Course Weight</span>
        <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-blue-100 text-blue-700 border border-blue-200">
          {assessment.percentage}%
        </span>
      </div>
    )}
  </div>
  
  {/* Navegación superior - DISEÑO MODERNO */}
  <div className="flex justify-center pt-3">
    {isTeacher && assessment.assessmentType !== 'announcement' && (
      <Link
        to={`/courses/${courseCode}/assessments/${assessmentId}/grade`}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white hover:shadow-lg transition-all duration-300 font-medium shadow-sm"
      >
        <CheckCircle className="h-3 w-3" />
        Grade
      </Link>
    )}
  </div>
</div>




                </div>
              </div>
            </div>

            {/* Archivos adjuntos */}
            {attachments.length > 0 && (
              <div className="modern-card">
                <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <Paperclip className="h-5 w-5 text-blue-600" />
                  Attached Files
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {attachments.map((attachment: any, index: number) => (
                    <a
                      key={index}
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group bg-white border border-gray-200 rounded-xl p-4 hover:bg-blue-50 hover:border-blue-200 transition-all duration-300 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center transition-all">
                          {getFileIcon(attachment.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                              {attachment.name}
                            </p>
                            <DownloadIcon className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                          </div>
                          {attachment.size && (
                            <p className="text-sm text-gray-500 mt-1">
                              {attachment.size} • {attachment.type?.toUpperCase() || 'FILE'}
                            </p>
                          )}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

         
          </div>
        )}

        {activeTab === 'forum' && assessment.type === 'forum' && (
          <div className="space-y-2">
            <div className="modern-card">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <MessageSquare className="h-6 w-6 text-blue-600" />
                    Discussion Forum
                  </h2>
                  <p className="text-sm text-gray-600">Share ideas and reply to your class.</p>
                </div>
                <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-blue-100 text-blue-700 border border-blue-200">
                  {visibleForumComments.length} comments
                </span>
              </div>

              <div className="mb-4 border border-blue-200 rounded-xl p-4 bg-blue-50">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-2">Question</p>
                <h3 className="text-base font-bold text-gray-900">{assessment.name}</h3>
                {sanitizedAssessmentDescription ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: sanitizedAssessmentDescription }}
                  />
                ) : (
                  <p className="text-sm text-gray-700 mt-2">
                    No additional description provided by the teacher.
                  </p>
                )}
                {forumCloseAtDate && (
                  <p className="text-xs text-gray-600 mt-3">
                    Forum closes at {safeFormatDateTime(forumCloseAtDate, 'dd/MM/yyyy HH:mm', 'N/A')}
                  </p>
                )}
              </div>

              {isStudent && (
                <div className="mb-4 border border-gray-200 rounded-xl p-4 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-base font-bold text-gray-900">Forum Requirements</h3>
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                        studentForumProgress?.isCompliant
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {studentForumProgress?.isCompliant ? "Completed" : "Pending"}
                    </span>
                  </div>

                  <p className="text-sm text-gray-700">
                    Main posts: <span className="font-semibold">{studentForumProgress?.mainPosts ?? 0}/{forumRequirements.mainResponsesRequired}</span> • Words: <span className="font-semibold">{studentForumProgress?.mainPostWords ?? 0}/{forumRequirements.mainResponseMinWords}</span> • Replies: <span className="font-semibold">{studentForumProgress?.repliesToPeers ?? 0}/{forumRequirements.peerRepliesRequired}</span> • Reply comments: <span className="font-semibold">{studentForumProgress?.commentsOnPeerReplies ?? 0}/{forumRequirements.peerReplyCommentsRequired}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Reply comments = replying to a classmate's reply (not only to the main post).
                  </p>
                </div>
              )}

              {isTeacher && forumComplianceStats && (
                <div className="mb-4 border border-gray-200 rounded-xl p-4 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-base font-bold text-gray-900">Forum Preset Compliance</h3>
                    <span className="text-xs text-gray-500">
                      Main posts: {forumRequirements.mainResponsesRequired} • Min words: {forumRequirements.mainResponseMinWords} • Peer replies: {forumRequirements.peerRepliesRequired} • Comments on peer replies: {forumRequirements.peerReplyCommentsRequired}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-lg border border-gray-200 px-3 py-2">
                      <p className="text-xs text-gray-500">Students</p>
                      <p className="text-lg font-bold text-gray-900">{forumComplianceStats.totals.totalStudents}</p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                      <p className="text-xs text-blue-700">Compliant</p>
                      <p className="text-lg font-bold text-blue-800">{forumComplianceStats.totals.compliantCount}</p>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-xs text-red-700">Pending</p>
                      <p className="text-lg font-bold text-red-800">{forumComplianceStats.totals.nonCompliantCount}</p>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-auto border border-gray-200 rounded-lg">
                    {forumComplianceStats.students.map((item) => (
                      <div key={item.studentId} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 last:border-b-0">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.studentName}</p>
                          <p className="text-xs text-gray-600">
                            Posts {item.mainPosts}/{forumRequirements.mainResponsesRequired} • Words {item.mainPostWords}/{forumRequirements.mainResponseMinWords} • Replies {item.repliesToPeers}/{forumRequirements.peerRepliesRequired} • Reply comments {item.commentsOnPeerReplies}/{forumRequirements.peerReplyCommentsRequired}
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${item.isCompliant ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-800"}`}>
                          {item.isCompliant ? "Compliant" : "Pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isForumClosed && (
                <div className="mb-4 border border-gray-300 rounded-xl p-3 bg-gray-100">
                  <p className="text-sm font-semibold text-gray-800">
                    Forum closed. New comments and replies are disabled.
                  </p>
                </div>
              )}

              <div className="mb-4 border border-gray-200 rounded-xl p-3 bg-gray-50">
                <textarea
                  value={forumMessage}
                  onChange={(event) => setForumMessage(event.target.value)}
                  placeholder="Write your comment..."
                  rows={3}
                  disabled={isForumClosed}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handlePublishForumComment()}
                    disabled={isForumClosed || postingForumComment || !forumMessage.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                    {postingForumComment ? 'Publishing...' : 'Publish'}
                  </button>
                </div>
              </div>

              {visibleForumComments.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-gray-300 rounded-xl bg-gray-50">
                  <MessageSquare className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                  <p className="font-semibold text-gray-700">No comments yet</p>
                  <p className="text-sm text-gray-500">Be the first to start the conversation.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {topLevelForumComments.map((comment) => (
                    <div key={comment.id} className="border border-gray-200 rounded-xl p-3 bg-white">
                      {(() => {
                        const profile = commentUserProfiles[comment.userId];
                        const avatarUrl = comment.userAvatarUrl || profile?.avatarUrl || '';
                        const avatarEmoji = comment.userAvatarEmoji || profile?.avatarEmoji || '';
                        const displayName = resolveForumDisplayName(
                          comment.userName,
                          profile?.name,
                        );

                        return (
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={displayName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span>{avatarEmoji || displayName.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                            <p className="text-xs text-gray-500">
                              {safeFormatDateTime(comment.createdAt, 'dd/MM/yyyy HH:mm', 'Just now')}
                              {comment.pending ? ' • sending...' : ''}
                            </p>
                          </div>
                        </div>
                        {(isTeacher || user?.id === comment.userId) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteForumComment(comment.id, comment.userId)}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                            title="Delete comment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                        );
                      })()}
                      <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{comment.content}</p>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleLike(comment)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                            (comment.likedBy || []).includes(user?.id || '')
                              ? 'bg-blue-50 border-blue-200 text-blue-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          👍 {comment.likedBy?.length || 0}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleDislike(comment)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                            (comment.dislikedBy || []).includes(user?.id || '')
                              ? 'bg-gray-100 border-gray-300 text-gray-800'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          👎 {comment.dislikedBy?.length || 0}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setReplyingToCommentId((prev) => (prev === comment.id ? null : comment.id))
                          }
                          disabled={isForumClosed}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          Reply
                        </button>
                      </div>

                      {replyingToCommentId === comment.id && (
                        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <textarea
                            rows={2}
                            value={replyDrafts[comment.id] || ''}
                            onChange={(event) =>
                              setReplyDrafts((prev) => ({ ...prev, [comment.id]: event.target.value }))
                            }
                            placeholder="Write a reply..."
                            disabled={isForumClosed}
                            className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handlePublishForumComment(comment.id)}
                              disabled={isForumClosed || postingForumComment || !(replyDrafts[comment.id] || '').trim()}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Reply
                            </button>
                          </div>
                        </div>
                      )}

                      {(forumRepliesByParent[comment.id] || []).length > 0 && (
                        <div className="mt-3 pl-4 border-l-2 border-gray-100 space-y-2">
                          {(forumRepliesByParent[comment.id] || []).map((reply) => (
                            <div key={reply.id} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/70">
                              {(() => {
                                const profile = commentUserProfiles[reply.userId];
                                const avatarUrl = reply.userAvatarUrl || profile?.avatarUrl || '';
                                const avatarEmoji = reply.userAvatarEmoji || profile?.avatarEmoji || '';
                                const displayName = resolveForumDisplayName(
                                  reply.userName,
                                  profile?.name,
                                );

                                return (
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5">
                                  <div className="h-8 w-8 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                                    {avatarUrl ? (
                                      <img
                                        src={avatarUrl}
                                        alt={displayName}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span>{avatarEmoji || displayName.charAt(0).toUpperCase()}</span>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-gray-900">{displayName}</p>
                                    <p className="text-[11px] text-gray-500">
                                      {safeFormatDateTime(reply.createdAt, 'dd/MM/yyyy HH:mm', 'Just now')}
                                      {reply.pending ? ' • sending...' : ''}
                                    </p>
                                  </div>
                                </div>
                                {(isTeacher || user?.id === reply.userId) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteForumComment(reply.id, reply.userId)}
                                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                                    title="Delete reply"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                                );
                              })()}
                              <p className="mt-2 text-xs text-gray-700 whitespace-pre-line">{reply.content}</p>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleLike(reply)}
                                  className={`px-2 py-1 rounded-md text-[11px] font-medium border ${
                                    (reply.likedBy || []).includes(user?.id || '')
                                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  👍 {reply.likedBy?.length || 0}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleDislike(reply)}
                                  className={`px-2 py-1 rounded-md text-[11px] font-medium border ${
                                    (reply.dislikedBy || []).includes(user?.id || '')
                                      ? 'bg-gray-100 border-gray-300 text-gray-800'
                                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  👎 {reply.dislikedBy?.length || 0}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyingToCommentId((prev) => (prev === reply.id ? null : reply.id))
                                  }
                                  disabled={isForumClosed}
                                  className="px-2 py-1 rounded-md text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                                >
                                  Reply
                                </button>
                              </div>

                              {replyingToCommentId === reply.id && (
                                <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2.5">
                                  <textarea
                                    rows={2}
                                    value={replyDrafts[reply.id] || ''}
                                    onChange={(event) =>
                                      setReplyDrafts((prev) => ({ ...prev, [reply.id]: event.target.value }))
                                    }
                                    placeholder="Write a reply comment..."
                                    disabled={isForumClosed}
                                    className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                  <div className="mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => handlePublishForumComment(reply.id)}
                                      disabled={isForumClosed || postingForumComment || !(replyDrafts[reply.id] || '').trim()}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-[11px] font-medium hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                      Reply
                                    </button>
                                  </div>
                                </div>
                              )}

                              {(forumRepliesByParent[reply.id] || []).length > 0 && (
                                <div className="mt-2 pl-3 border-l border-gray-200 space-y-2">
                                  {(forumRepliesByParent[reply.id] || []).map((replyComment) => (
                                    <div key={replyComment.id} className="rounded-lg border border-gray-200 bg-white p-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <p className="text-[11px] font-semibold text-gray-900">
                                            {resolveForumDisplayName(
                                              replyComment.userName,
                                              commentUserProfiles[replyComment.userId]?.name,
                                            )}
                                          </p>
                                          <p className="text-[10px] text-gray-500">
                                            {safeFormatDateTime(replyComment.createdAt, 'dd/MM/yyyy HH:mm', 'Just now')}
                                            {replyComment.pending ? ' • sending...' : ''}
                                          </p>
                                        </div>
                                        {(isTeacher || user?.id === replyComment.userId) && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteForumComment(replyComment.id, replyComment.userId)}
                                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                            title="Delete reply comment"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                      <p className="mt-1 text-[11px] text-gray-700 whitespace-pre-line">
                                        {replyComment.content}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab de entrega para estudiantes - DISEÑO MODERNO */}
        {activeTab === 'submission' && isStudent && assessment.assessmentType === 'delivery' && (
          <div className="space-y-2">
            <div className="modern-card">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-2">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <Upload className="h-6 w-6 text-blue-600" />
                    My Submission
                  </h2>
                  <p className="text-gray-600">
                    {assessment.deliveryType === 'text' 
                      ? 'Write your response in the text field below. Only text submissions are accepted.'
                      : 'Upload your file for this activity.'}
                  </p>
                </div>
                
                {/* Estado de la entrega */}
<div className="flex items-center gap-3">
  <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
    submissionStatusInfo.status === 'closed' 
      ? 'bg-red-100 text-red-700 border border-red-200'
      : submissionStatusInfo.status === 'not_started'
      ? 'bg-gray-100 text-gray-700 border border-gray-200'
      : submissionStatus === 'submitted'
      ? 'bg-blue-100 text-blue-700 border border-blue-200'
      : submissionStatus === 'graded'
      ? 'bg-blue-100 text-blue-700 border border-blue-200'
      : submissionStatus === 'sent'
      ? 'bg-blue-100 text-blue-700 border border-blue-200' // Nuevo color para "Sent"
      : 'bg-blue-100 text-blue-700 border border-blue-200'
  }`}>
    {submissionStatusInfo.status === 'closed' 
      ? 'Closed'
      : submissionStatusInfo.status === 'not_started'
      ? 'Not Started'
      : submissionStatus === 'submitted'
      ? 'Submitted'
      : submissionStatus === 'graded'
      ? 'Graded'
      : submissionStatus === 'sent'
      ? 'Sent' // Nuevo estado
      : 'In Progress'}
  </span>
  
  {studentSubmission && studentSubmission.submittedAt && (
    <span className="text-sm text-gray-500">
      {safeFormatDateTime(studentSubmission.submittedAt, "dd/MM/yyyy HH:mm", "-")}
    </span>
  )}
</div>
              </div>

              {/* Alertas de estado */}
              {submissionStatusInfo.status === 'closed' && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-red-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-red-900 mb-1">Submission Closed</h4>
                      <p className="text-red-700">
                        The submission deadline ended on {formatDate(assessment.dueDate)} at {formatTime(assessment.dueDate)}. 
                        You can no longer edit, delete, or submit new submissions.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {submissionStatusInfo.status === 'not_started' && (
                <div className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                    <CalendarClock className="h-5 w-5 text-gray-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-gray-900 mb-1">Activity Not Started</h4>
                      <p className="text-gray-700">
                        The activity will begin on {formatDate(assessment.startDate)} at {formatTime(assessment.startDate)}. 
                        You will be able to submit your work from that date onwards.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {submissionStatus === 'graded' && (
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-blue-900 mb-1">Submission Graded</h4>
                      <p className="text-blue-700">
                        Your submission has been graded by the professor. You can no longer edit it.
                        {studentSubmission?.grade && (
                          <span className="font-bold ml-2">
                            Grade: {studentSubmission.grade}/{assessment.maxPoints}.0
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6 border border-blue-200 rounded-xl p-4 bg-blue-50">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-2">Question</p>
                <h3 className="text-base font-bold text-gray-900">{assessment.name}</h3>
                {sanitizedAssessmentDescription ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: sanitizedAssessmentDescription }}
                  />
                ) : (
                  <p className="text-sm text-gray-700 mt-2">
                    No additional description provided by the teacher.
                  </p>
                )}
              </div>

              {/* Editor de texto */}
{assessment.deliveryType === 'text' && (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
        <Type className="h-5 w-5 text-blue-600" />
        Your Response
      </h3>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {submissionText && (
          <>
            <span>{submissionText.trim().split(/\s+/).length} words</span>
            <span>•</span>
            <span>{submissionText.length} characters</span>
          </>
        )}
      </div>
    </div>
  <div className="border border-gray-300 rounded-xl overflow-hidden hover:border-blue-300 transition-colors">
      {isEditingSubmission || !studentSubmission ? (
        <>
          <div className="relative">
            <textarea
              ref={textAreaRef}
              value={submissionText}
              onChange={(e) => {
                setSubmissionText(e.target.value);
                // Auto-expand textarea
                if (textAreaRef.current) {
                  textAreaRef.current.style.height = 'auto';
                  textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 400)}px`;
                }
              }}
              placeholder="Write your response here..."
              className="w-full min-h-[120px] max-h-[400px] p-5 focus:outline-none resize-none text-gray-700 bg-white transition-height duration-200"
              disabled={!submissionStatusInfo.canSubmit || isSubmitting}
              rows={4}
              onFocus={() => {
                // Expand slightly on focus
                if (textAreaRef.current && submissionText.length === 0) {
                  textAreaRef.current.style.height = '160px';
                }
              }}
              onBlur={() => {
                // Shrink back if empty on blur
                if (textAreaRef.current && submissionText.length === 0) {
                  textAreaRef.current.style.height = '120px';
                }
              }}
            />
            
            {/* Character counter in bottom right */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2 text-sm text-gray-500 bg-white/80 px-2 py-1 rounded">
              <span className={submissionText.length > 10000 ? 'text-red-500 font-medium' : ''}>
                {submissionText.length}/10000
              </span>
            </div>
          </div>
          
          <div className="border-t border-gray-300 bg-gray-50 p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-sm text-gray-500">
              {submissionStatusInfo.canSubmit 
                ? 'Write your response and choose to save as draft or submit definitively.'
                : 'You cannot edit this submission.'}
            </div>
            <div className="flex gap-2">
              {submissionStatusInfo.canDelete && studentSubmission && (
                <button
                  onClick={handleDeleteSubmission}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
              
              {submissionStatusInfo.canSubmit && (
                <>
                  <button
                    onClick={handleSaveDraft}
                    disabled={isSubmitting || !submissionText.trim()}
                    className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {isSubmitting ? 'Saving...' : 'Save Draft'}
                  </button>
                  
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !submissionText.trim()}
                    className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {isSubmitting ? 'Submitting...' : 'Submit Assignment'}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
       <div className="p-5 bg-gray-50">
            <div className="prose max-w-none">
              <div className="whitespace-pre-line text-gray-700 min-h-[120px]">
                {studentSubmission.content}
              </div>
            </div>
          </div>

{/* MOSTRAR FEEDBACK DEL PROFESOR - NUEVA SECCIÓN */}
          {studentSubmission.feedback && (
            <div className="border-t border-gray-300 bg-blue-50 p-5">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-gray-900 flex items-center gap-2">
                      Teacher Feedback
                    
                    </h4>
                    {studentSubmission.gradedAt && (
                      <span className="text-xs text-gray-500">
                        {safeFormatDateTime(studentSubmission.gradedAt, "dd/MM/yyyy HH:mm", "-")}
                      </span>
                    )}
                  </div>
                  <div className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm">
                    <p className="text-gray-700 whitespace-pre-line">
                      {studentSubmission.feedback}
                    </p>
                  </div>
               
                </div>
              </div>
            </div>
          )}
          
          <div className="border-t border-gray-300 bg-gray-50 p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-sm text-gray-500">
              {submissionStatus === 'submitted' 
                ? 'Submitted on ' + safeFormatDateTime(studentSubmission.submittedAt, "dd/MM/yyyy HH:mm", "-")
                : 'Draft saved on ' + safeFormatDateTime(studentSubmission.updatedAt, "dd/MM/yyyy HH:mm", "-")}
            </div>
            <div className="flex gap-2">
              {submissionStatusInfo.canEdit && (
                <button
                  onClick={handleStartEditing}
                  className="px-4 py-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
    

         
    
    {/* Información de la actividad */}
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
      <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
        <Info className="h-4 w-4 text-blue-600" />
        Activity Information
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-600 mb-1">Start Date</p>
          <p className="font-medium text-gray-900">
            {formatDate(assessment.startDate)} {formatTime(assessment.startDate) && `at ${formatTime(assessment.startDate)}`}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Due Date</p>
          <p className="font-medium text-gray-900">
            {formatDate(assessment.dueDate)} {formatTime(assessment.dueDate) && `at ${formatTime(assessment.dueDate)}`}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Time Remaining</p>
          <p className={`font-bold ${isPastDue ? 'text-red-600' : 'text-blue-600'}`}>
            {timeRemaining}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Status</p>
          <p className="font-medium text-gray-900">
            {submissionStatusInfo.status === 'closed' 
              ? 'Closed' 
              : submissionStatusInfo.status === 'not_started'
              ? 'Not Started'
              : submissionStatus === 'submitted'
              ? 'Submitted'
              : submissionStatus === 'graded'
              ? 'Graded'
              : 'In Progress'}
          </p>
        </div>
      </div>
    </div>
  </div>
)}


              
              {/* Si no es una actividad de entrega de texto */}
              {assessment.deliveryType !== 'text' && (
                <div className="text-center py-12">
                  <FileUp className="h-16 w-16 mx-auto text-gray-300 mb-2" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Unsupported Delivery Type</h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-2">
                    This activity requires a different delivery type than text. Please contact the teacher for more information.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab de calificaciones (profesores) - DISEÑO MODERNO */}
        {activeTab === 'grades' && isTeacher && assessment.assessmentType !== 'announcement' && (
          <div className="space-y-2">
            <div className="modern-card">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-2">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <Award className="h-6 w-6 text-blue-600" />
                    Student Grades
                  </h2>
                  <p className="text-gray-600">
                    Manage and review grades assigned to students for this assessment.
                  </p>
                </div>
            
              </div>
              
              {/* Estadísticas */}
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-600 font-bold">Total Students</p>
                        <p className="text-xl font-bold text-gray-900">{stats.total}</p>
                      </div>
                      <Users className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-blue-600 font-bold">{stats.graded} graded</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-700">{stats.pending} pending</span>
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-600 font-bold">Average Score</p>
                        <p className="text-xl font-bold text-gray-900">{stats.average}</p>
                      </div>
                      <BarChart3 className="h-6 w-6  text-blue-600" />
                    </div>
                    <div className="mt-2 text-sm text-gray-700">
                      out of {assessment.maxPoints} points
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-600 font-bold">Passing Rate</p>
                        <p className="text-xl font-bold text-gray-900">{stats.passingRate}%</p>
                      </div>
                      <Percent className="h-6 w-6  text-blue-600" />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-blue-600 font-bold">{stats.passingCount} passed</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-700">{stats.failingCount} failed</span>
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-600 font-bold">Score Range</p>
                        <p className="text-xl font-bold text-gray-900">{stats.highest} / {stats.lowest}</p>
                      </div>
                      <TrendingUp className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="mt-2 text-sm text-gray-700">
                      Highest / Lowest
                    </div>
                  </div>
                </div>
              )}
              
              {/* Tabla de calificaciones */}
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Student
                        </div>
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4" />
                          Grade
                        </div>
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Status
                        </div>
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Graded
                        </div>
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        Actions
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          Comments
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {displayedGrades.map((grade, index) => (
                      <tr key={grade.id || index} className="hover:bg-blue-50 transition-all">
                        <td className="py-4 px-6 whitespace-nowrap">
                          {(() => {
                            const profile = commentUserProfiles[grade.studentId];
                            const avatarUrl = profile?.avatarUrl || '';
                            const avatarEmoji = profile?.avatarEmoji || '';
                            const displayName = grade.studentName || 'Student';

                            return (
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl overflow-hidden bg-blue-100 flex items-center justify-center text-blue-700 font-bold shadow-sm">
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={displayName}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span>{avatarEmoji || displayName.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{displayName}</p>
                              <p className="text-xs text-gray-500">{grade.studentEmail}</p>
                            </div>
                          </div>
                            );
                          })()}
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${grade.score !== null && grade.score >= assessment.passingScore ? 'text-blue-600' : 'text-red-600'}`}>
                              {grade.score !== null ? grade.score.toFixed(1) : '--'} / {assessment.maxPoints}
                            </span>
                          </div>
                        </td>
                      
                        <td className="py-4 px-6 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                            grade.score === null 
                              ? 'bg-gray-100 text-gray-700' 
                              : grade.score >= assessment.passingScore 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {grade.score === null ? (
                              <>
                                <Clock className="h-3 w-3" />
                                Pending
                              </>
                            ) : grade.score >= assessment.passingScore ? (
                              <>
                                <CheckCircle className="h-3 w-3" />
                                Passed
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3 w-3" />
                                Failed
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {grade.gradedAt ? (
                              <>
                                <div>{safeFormatDateTime(grade.gradedAt, 'dd/MM/yyyy', '-')}</div>
                                <div className="text-xs text-gray-500">{safeFormatDateTime(grade.gradedAt, 'HH:mm', '-')}</div>
                              </>
                            ) : (
                              <span className="text-gray-400">Not graded</span>
                            )}
                          </div>
                        </td>
                        
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {assessment.gradeSheetId && (
                              <Link
                                to={`/courses/${courseCode}/grade-sheets/${assessment.gradeSheetId}/edit?student=${grade.studentId}`}
                                className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View details"
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                            )}
                            <Link
                              to={`/courses/${courseCode}/assessments/${assessmentId}/grade?student=${grade.studentId}`}
                              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Edit grade"
                            >
                              <Edit className="h-4 w-4" />
                            </Link>
                          </div>
                        </td>

                        <td className="py-4 px-6">
                          <p className="text-sm text-gray-600 max-w-xs line-clamp-3">
                            {grade.comment || (
                              <span className="text-gray-400 italic text-sm">No comments</span>
                            )}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {grades.length > 50 && (
                  <div className="border-t border-gray-200 px-6 py-4">
                    <button
                      onClick={() => setShowAllGrades(!showAllGrades)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-700 font-bold"
                    >
                      {showAllGrades ? (
                        <>
                          <EyeOff className="h-4 w-4" />
                          Show Less (50)
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Show All Grades ({grades.length})
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              
              {grades.length === 0 && (
                <div className="text-center py-12">
                  <Award className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No grades recorded</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    {assessment.gradeSheetId 
                      ? 'No grades found for this assessment in the linked grade sheet.'
                      : 'This assessment is not linked to a grade sheet.'}
                  </p>
                  <Link
                    to={`/courses/${courseCode}/assessments/${assessmentId}/grade`}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white hover:shadow-lg transition-all duration-300 font-bold"
                  >
                    <CheckCircle className="h-5 w-5" />
                    {assessment.gradeSheetId ? 'View Grades' : 'Start Grading'}
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab de análisis (solo profesores) - DISEÑO MODERNO */}
        {activeTab === 'analytics' && isTeacher && assessment.assessmentType !== 'announcement' && stats && (
          <div className="space-y-2">
            <div className="modern-card">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-2">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <LineChart className="h-6 w-6 text-blue-600" />
                    Performance Analysis
                  </h2>
                  <p className="text-gray-600 mt-1">
                    Statistical summary of grades for this assessment
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {stats.graded} graded out of {stats.total} students
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    stats.pending > 0
                      ? "bg-gray-100 text-gray-800"
                      : "bg-blue-100 text-blue-800"
                  }`}>
                    {stats.pending > 0
                      ? `${stats.pending} pending`
                      : "All graded"}
                  </span>
                </div>
              </div>

              {/* Estadísticas principales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700 font-bold">Average</p>
                      <p className="text-xl font-bold text-gray-900">{stats.average}</p>
                    </div>
                    <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center shadow-sm">
                      <BarChart3 className="h-4 w-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-600">
                    out of {assessment.maxPoints} points
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700 font-bold">Passing Rate</p>
                      <p className="text-xl font-bold text-gray-900">{stats.passingRate}%</p>
                    </div>
                    <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center shadow-sm">
                      <Percent className="h-4 w-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-600">
                    {stats.passingCount} of {stats.graded}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700 font-bold">Highest</p>
                      <p className="text-xl font-bold text-gray-900">{stats.highest}</p>
                    </div>
                    <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center shadow-sm">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-600">
                    Maximum grade
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700 font-bold">Lowest</p>
                      <p className="text-xl font-bold text-gray-900">{stats.lowest}</p>
                    </div>
                    <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center shadow-sm">
                      <TrendingUp className="h-4 w-4 text-blue-600 rotate-180" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-600">
                    Minimum grade
                  </div>
                </div>
              </div>

              {/* Grade distribution */}
              {stats.graded > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <PieChart className="h-5 w-5 text-blue-600" />
                      Distribution by Ranges
                    </h3>
                    <span className="text-sm text-gray-500">
                      {stats.graded} graded students
                    </span>
                  </div>

                  <div className="space-y-2">
                    {[
                      {
                        label: "Excellent",
                        range: "90-100%",
                        value: stats.distribution.excellent,
                        color: "bg-emerald-500",
                        textColor: "text-blue-700",
                      },
                      {
                        label: "Good",
                        range: "80-89%",
                        value: stats.distribution.good,
                        color: "bg-blue-500",
                        textColor: "text-blue-700",
                      },
                      {
                        label: "Acceptable",
                        range: "70-79%",
                        value: stats.distribution.average,
                        color: "bg-amber-500",
                        textColor: "text-gray-700",
                      },
                      {
                        label: "Regular",
                        range: "60-69%",
                        value: stats.distribution.poor,
                        color: "bg-orange-500",
                        textColor: "text-gray-700",
                      },
                      {
                        label: "Needs Improvement",
                        range: "0-59%",
                        value: stats.distribution.failing,
                        color: "bg-red-500",
                        textColor: "text-red-700",
                      },
                    ].map((item, index) => {
                      const percentage = stats.graded > 0 ? (item.value / stats.graded) * 100 : 0;
                      const showBar = item.value > 0;

                      return (
                        <div key={index} className={`space-y-2 ${!showBar ? "opacity-60" : ""}`}>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-3">
                              <span className={`w-3 h-3 rounded-full ${item.color}`}></span>
                              <div>
                                <span className="font-bold text-gray-700">{item.label}</span>
                                <span className="text-gray-500 ml-2">({item.range})</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${item.textColor}`}>{item.value}</span>
                              <span className="text-gray-500 text-xs w-12 text-right">({percentage.toFixed(0)}%)</span>
                            </div>
                          </div>
                          {showBar && (
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${item.color}`} style={{ width: `${percentage}%` }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

           

            </div>

      
            {/* No graded students yet */}
            {assessment.assessmentType !== 'announcement' && stats.graded === 0 && (
              <div className="modern-card">
                <div className="text-center py-12">
                  <BarChart3 className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No data available for analysis</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    There are no graded students for this assessment yet. Once you grade students, detailed analytics will appear here.
                  </p>
                  <Link
                    to={`/courses/${courseCode}/assessments/${assessmentId}/grade`}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white hover:shadow-lg transition-all duration-300 font-bold"
                  >
                    <CheckCircle className="h-5 w-5" />
                    Start Grading
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
