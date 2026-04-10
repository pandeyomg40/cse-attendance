import { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  setDoc,
  getDocs,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export interface Student {
  id: string;
  name: string;
  rollNumber: string;
  faceDescriptor: number[]; // Serialized Float32Array
  photo?: string; // Base64 image
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  date: string;
  signInTime: string | null;
  signOutTime: string | null;
  status: 'Present' | 'Absent';
}

export interface Schedule {
  id: string;
  title: string;
  description: string;
  time: string;
  date: string;
}

export function useAttendanceSystem() {
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  // Real-time listeners
  useEffect(() => {
    const studentsUnsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
      const studentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(studentsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'students'));

    const recordsUnsubscribe = onSnapshot(query(collection(db, 'attendance'), orderBy('date', 'desc')), (snapshot) => {
      const recordsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      setRecords(recordsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'attendance'));

    const schedulesUnsubscribe = onSnapshot(query(collection(db, 'schedules'), orderBy('date', 'desc')), (snapshot) => {
      const schedulesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule));
      setSchedules(schedulesData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'schedules'));

    return () => {
      studentsUnsubscribe();
      recordsUnsubscribe();
      schedulesUnsubscribe();
    };
  }, []);

  const registerStudent = async (name: string, rollNumber: string, descriptor: Float32Array, photo?: string) => {
    try {
      const id = crypto.randomUUID();
      const newStudent: Student = {
        id,
        name,
        rollNumber,
        faceDescriptor: Array.from(descriptor),
        photo
      };
      await setDoc(doc(db, 'students', id), newStudent);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'students');
    }
  };

  const markAttendance = async (studentId: string, mode: 'Sign In' | 'Sign Out') => {
    try {
      const student = students.find(s => s.id === studentId);
      if (!student) return 'Not Found';

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Check for existing record today
      const q = query(collection(db, 'attendance'), where('studentId', '==', studentId), where('date', '==', today));
      const querySnapshot = await getDocs(q);
      
      if (mode === 'Sign In') {
        if (!querySnapshot.empty) {
          const record = querySnapshot.docs[0].data() as AttendanceRecord;
          if (record.signInTime) return 'Already Signed In';
          
          await updateDoc(doc(db, 'attendance', querySnapshot.docs[0].id), {
            signInTime: timeStr
          });
        } else {
          const id = crypto.randomUUID();
          const newRecord: AttendanceRecord = {
            id,
            studentId,
            studentName: student.name,
            rollNumber: student.rollNumber,
            date: today,
            signInTime: timeStr,
            signOutTime: null,
            status: 'Present',
          };
          await setDoc(doc(db, 'attendance', id), newRecord);
        }
        return 'Success Sign In';
      } else {
        if (querySnapshot.empty) {
          return 'Sign In Required';
        }
        const record = querySnapshot.docs[0].data() as AttendanceRecord;
        if (record.signOutTime) {
          return 'Already Signed Out';
        }

        await updateDoc(doc(db, 'attendance', querySnapshot.docs[0].id), {
          signOutTime: timeStr
        });
        return 'Success Sign Out';
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
      return 'Error';
    }
  };

  const getStats = (studentId: string) => {
    const studentRecords = records.filter(r => r.studentId === studentId);
    const totalDays = 25; 
    const presentDays = studentRecords.length;
    const percentage = (presentDays / totalDays) * 100;

    const currentMonth = new Date().getMonth();
    const monthlyRecap = records.filter(r => {
      const recordDate = new Date(r.date);
      return recordDate.getMonth() === currentMonth && r.studentId === studentId;
    }).length;

    return {
      percentage: Math.min(percentage, 100).toFixed(1),
      monthlyRecap,
      totalPresent: presentDays
    };
  };

  const addSchedule = async (title: string, description: string, time: string) => {
    try {
      const id = crypto.randomUUID();
      const newSchedule: Schedule = {
        id,
        title,
        description,
        time,
        date: new Date().toISOString().split('T')[0],
      };
      await setDoc(doc(db, 'schedules', id), newSchedule);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'schedules');
    }
  };

  const deleteSchedule = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'schedules', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `schedules/${id}`);
    }
  };

  const deleteStudent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'students', id));
      // Optionally delete attendance records too, but Firestore rules might handle this or we can do it here
      const q = query(collection(db, 'attendance'), where('studentId', '==', id));
      const querySnapshot = await getDocs(q);
      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `students/${id}`);
    }
  };

  return { 
    students, 
    records, 
    schedules, 
    isAdminLoggedIn, 
    setIsAdminLoggedIn, 
    registerStudent, 
    markAttendance, 
    deleteStudent,
    addSchedule,
    deleteSchedule,
    getStats
  };
}
