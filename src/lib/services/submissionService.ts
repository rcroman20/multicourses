// src/lib/services/submissionService.ts

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  limit,
  startAfter,
  DocumentSnapshot
} from 'firebase/firestore';

export interface Submission {
  id?: string;
  studentId: string;
  assessmentId: string;
  courseId: string;
  content: string;
  status: 'draft' | 'submitted' | 'graded';
  grade?: number;
  maxScore?: number;
  feedback?: string;
  submittedAt: string | Date;
  updatedAt: string | Date;
  wordCount: number;
  characterCount: number;
  metadata?: {
    attachments?: Array<{
      name: string;
      url: string;
      type: string;
      size?: number;
    }>;
    plagiarismScore?: number;
    similarityCheck?: boolean;
    lateSubmission?: boolean;
    lateMinutes?: number;
  };
  gradedAt?: string | Date;
  gradedBy?: string;
}

export interface CreateSubmissionData {
  studentId: string;
  assessmentId: string;
  courseId: string;
  content: string;
  status: 'draft' | 'submitted' | 'graded';
  grade?: number;
  maxScore?: number;
  feedback?: string;
  wordCount: number;
  characterCount: number;
  metadata?: {
    attachments?: Array<{
      name: string;
      url: string;
      type: string;
      size?: number;
    }>;
    plagiarismScore?: number;
    similarityCheck?: boolean;
    lateSubmission?: boolean;
    lateMinutes?: number;
  };
}

export interface UpdateSubmissionData {
  content?: string;
  status?: 'draft' | 'submitted' | 'graded';
  grade?: number;
  feedback?: string;
  wordCount?: number;
  characterCount?: number;
  metadata?: {
    attachments?: Array<{
      name: string;
      url: string;
      type: string;
      size?: number;
    }>;
    plagiarismScore?: number;
    similarityCheck?: boolean;
    lateSubmission?: boolean;
    lateMinutes?: number;
  };
  gradedAt?: string | Date;
  gradedBy?: string;
}

export interface SubmissionStats {
  total: number;
  submitted: number;
  draft: number;
  graded: number;
  averageGrade: number;
  lateSubmissions: number;
}

class SubmissionService {
  private readonly collectionName = 'submissions';

  /**
   * Convert Firestore timestamp to Date
   */
  private convertTimestamp(timestamp: any): Date | null {
    if (!timestamp) return null;
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    return null;
  }

  /**
   * Convert Firestore document to Submission object
   */
  private docToSubmission(doc: any): Submission {
    const data = doc.data();
    return {
      id: doc.id,
      studentId: data.studentId,
      assessmentId: data.assessmentId,
      courseId: data.courseId,
      content: data.content || '',
      status: data.status || 'draft',
      grade: data.grade,
      maxScore: data.maxScore,
      feedback: data.feedback,
      submittedAt: this.convertTimestamp(data.submittedAt)?.toISOString() || new Date().toISOString(),
      updatedAt: this.convertTimestamp(data.updatedAt)?.toISOString() || new Date().toISOString(),
      wordCount: data.wordCount || 0,
      characterCount: data.characterCount || 0,
      metadata: data.metadata || {},
      gradedAt: data.gradedAt ? this.convertTimestamp(data.gradedAt)?.toISOString() : undefined,
      gradedBy: data.gradedBy
    };
  }

  /**
   * Get submission by ID
   */
  async getSubmissionById(submissionId: string): Promise<Submission | null> {
    try {
      const docRef = doc(db, this.collectionName, submissionId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return null;
      }
      
      return this.docToSubmission(docSnap);
    } catch (error) {
      console.error('Error getting submission by ID:', error);
      throw error;
    }
  }

  /**
   * Get submission by student and assessment
   */
  async getSubmissionByStudentAndAssessment(
    studentId: string, 
    assessmentId: string
  ): Promise<Submission | null> {
    try {
      const q = query(
        collection(db, this.collectionName),
        where('studentId', '==', studentId),
        where('assessmentId', '==', assessmentId),
        limit(1)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return null;
      }
      
      return this.docToSubmission(querySnapshot.docs[0]);
    } catch (error) {
      console.error('Error getting submission by student and assessment:', error);
      throw error;
    }
  }

  /**
   * Get all submissions for an assessment
   */
// En submissionService.ts - método getSubmissionsByAssessment
async getSubmissionsByAssessment(
  assessmentId: string, 
  status?: 'draft' | 'submitted' | 'graded'
): Promise<Submission[]> {
  try {
    console.log('🔍 Buscando entregas para assessmentId:', assessmentId);
    console.log('🔍 Filtro status:', status);
    
    let q;
    if (status) {
      q = query(
        collection(db, this.collectionName),
        where('assessmentId', '==', assessmentId),
        where('status', '==', status),
        orderBy('submittedAt', 'desc')
      );
    } else {
      q = query(
        collection(db, this.collectionName),
        where('assessmentId', '==', assessmentId),
        orderBy('submittedAt', 'desc')
      );
    }
    
    console.log('🔍 Query creada');
    const querySnapshot = await getDocs(q);
    console.log('✅ QuerySnapshot size:', querySnapshot.size);
    
    const submissions = querySnapshot.docs.map(doc => {
      console.log('📄 Documento encontrado:', doc.id, doc.data());
      return this.docToSubmission(doc);
    });
    
    console.log('📊 Total entregas encontradas:', submissions.length);
    return submissions;
  } catch (error) {
    console.error('❌ Error getting submissions by assessment:', error);
    throw error;
  }
}

  /**
   * Get all submissions for a student
   */
  async getSubmissionsByStudent(
    studentId: string, 
    courseId?: string
  ): Promise<Submission[]> {
    try {
      let q;
      if (courseId) {
        q = query(
          collection(db, this.collectionName),
          where('studentId', '==', studentId),
          where('courseId', '==', courseId),
          orderBy('submittedAt', 'desc')
        );
      } else {
        q = query(
          collection(db, this.collectionName),
          where('studentId', '==', studentId),
          orderBy('submittedAt', 'desc')
        );
      }
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => this.docToSubmission(doc));
    } catch (error) {
      console.error('Error getting submissions by student:', error);
      throw error;
    }
  }

  /**
   * Get all submissions for a course
   */
  async getSubmissionsByCourse(
    courseId: string, 
    assessmentId?: string
  ): Promise<Submission[]> {
    try {
      let q;
      if (assessmentId) {
        q = query(
          collection(db, this.collectionName),
          where('courseId', '==', courseId),
          where('assessmentId', '==', assessmentId),
          orderBy('submittedAt', 'desc')
        );
      } else {
        q = query(
          collection(db, this.collectionName),
          where('courseId', '==', courseId),
          orderBy('submittedAt', 'desc')
        );
      }
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => this.docToSubmission(doc));
    } catch (error) {
      console.error('Error getting submissions by course:', error);
      throw error;
    }
  }

  /**
   * Create a new submission
   */
  async createSubmission(data: CreateSubmissionData): Promise<Submission> {
    try {
      const submissionData = {
        ...data,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, this.collectionName), submissionData);
      
      return {
        id: docRef.id,
        ...data,
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error creating submission:', error);
      throw error;
    }
  }

  /**
   * Update an existing submission
   */
  async updateSubmission(submissionId: string, data: UpdateSubmissionData): Promise<Submission> {
    try {
      const docRef = doc(db, this.collectionName, submissionId);
      
      const updateData: any = {
        ...data,
        updatedAt: serverTimestamp()
      };
      
      // If grading, set gradedAt timestamp
      if (data.status === 'graded' || data.grade !== undefined) {
        updateData.gradedAt = serverTimestamp();
      }
      
      await updateDoc(docRef, updateData);
      
      // Get updated document
      const updatedDoc = await getDoc(docRef);
      return this.docToSubmission(updatedDoc);
    } catch (error) {
      console.error('Error updating submission:', error);
      throw error;
    }
  }

  /**
   * Delete a submission
   */
  async deleteSubmission(submissionId: string): Promise<void> {
    try {
      const docRef = doc(db, this.collectionName, submissionId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting submission:', error);
      throw error;
    }
  }

  /**
   * Grade a submission
   */
  async gradeSubmission(
    submissionId: string, 
    grade: number, 
    feedback?: string,
    gradedBy?: string
  ): Promise<Submission> {
    try {
      const docRef = doc(db, this.collectionName, submissionId);
      
      const updateData = {
        grade,
        feedback: feedback || '',
        status: 'graded',
        gradedAt: serverTimestamp(),
        gradedBy: gradedBy || 'system',
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(docRef, updateData);
      
      // Get updated document
      const updatedDoc = await getDoc(docRef);
      return this.docToSubmission(updatedDoc);
    } catch (error) {
      console.error('Error grading submission:', error);
      throw error;
    }
  }

  /**
   * Get submission statistics for an assessment
   */
  async getSubmissionStats(assessmentId: string): Promise<SubmissionStats> {
    try {
      const submissions = await this.getSubmissionsByAssessment(assessmentId);
      
      const stats: SubmissionStats = {
        total: submissions.length,
        submitted: submissions.filter(s => s.status === 'submitted').length,
        draft: submissions.filter(s => s.status === 'draft').length,
        graded: submissions.filter(s => s.status === 'graded').length,
        averageGrade: 0,
        lateSubmissions: 0
      };
      
      // Calculate average grade for graded submissions
      const gradedSubmissions = submissions.filter(s => s.status === 'graded' && s.grade !== undefined);
      if (gradedSubmissions.length > 0) {
        const totalGrade = gradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0);
        stats.averageGrade = totalGrade / gradedSubmissions.length;
      }
      
      // Count late submissions (based on metadata)
      stats.lateSubmissions = submissions.filter(s => 
        s.metadata?.lateSubmission === true
      ).length;
      
      return stats;
    } catch (error) {
      console.error('Error getting submission stats:', error);
      throw error;
    }
  }

  /**
   * Check if a student has submitted for an assessment
   */
  async hasStudentSubmitted(studentId: string, assessmentId: string): Promise<boolean> {
    try {
      const submission = await this.getSubmissionByStudentAndAssessment(studentId, assessmentId);
      return submission !== null && submission.status === 'submitted';
    } catch (error) {
      console.error('Error checking if student has submitted:', error);
      throw error;
    }
  }

  /**
   * Bulk grade submissions
   */
  async bulkGradeSubmissions(
    submissions: Array<{
      submissionId: string;
      grade: number;
      feedback?: string;
    }>,
    gradedBy?: string
  ): Promise<Submission[]> {
    try {
      const results: Submission[] = [];
      
      for (const submission of submissions) {
        const graded = await this.gradeSubmission(
          submission.submissionId,
          submission.grade,
          submission.feedback,
          gradedBy
        );
        results.push(graded);
      }
      
      return results;
    } catch (error) {
      console.error('Error bulk grading submissions:', error);
      throw error;
    }
  }

  /**
   * Get paginated submissions
   */
  async getPaginatedSubmissions(
    assessmentId: string,
    page: number = 1,
    pageSize: number = 20,
    status?: 'draft' | 'submitted' | 'graded'
  ): Promise<{
    submissions: Submission[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    try {
      // Get total count
      const allSubmissions = await this.getSubmissionsByAssessment(assessmentId, status);
      const total = allSubmissions.length;
      
      // Calculate pagination
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedSubmissions = allSubmissions.slice(startIndex, endIndex);
      
      return {
        submissions: paginatedSubmissions,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (error) {
      console.error('Error getting paginated submissions:', error);
      throw error;
    }
  }

  /**
   * Search submissions by content
   */
  async searchSubmissions(
    assessmentId: string,
    searchTerm: string,
    limit: number = 50
  ): Promise<Submission[]> {
    try {
      // Note: Firestore doesn't support full-text search natively
      // This is a basic implementation - consider using Algolia or similar for production
      const submissions = await this.getSubmissionsByAssessment(assessmentId);
      
      const searchTermLower = searchTerm.toLowerCase();
      return submissions.filter(submission => 
        submission.content.toLowerCase().includes(searchTermLower) ||
        submission.feedback?.toLowerCase().includes(searchTermLower) ||
        submission.metadata?.attachments?.some(attachment => 
          attachment.name.toLowerCase().includes(searchTermLower)
        )
      ).slice(0, limit);
    } catch (error) {
      console.error('Error searching submissions:', error);
      throw error;
    }
  }

  /**
   * Get submissions that need grading
   */
  async getSubmissionsNeedingGrading(assessmentId: string): Promise<Submission[]> {
    try {
      const submissions = await this.getSubmissionsByAssessment(assessmentId, 'submitted');
      
      // Filter submissions that haven't been graded yet
      return submissions.filter(submission => submission.status === 'submitted' && submission.grade === undefined);
    } catch (error) {
      console.error('Error getting submissions needing grading:', error);
      throw error;
    }
  }
}

export const submissionService = new SubmissionService();