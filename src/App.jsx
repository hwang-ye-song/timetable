import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './utils/supabaseClient';
import html2canvas from 'html2canvas';
import AuthModal from './AuthModal';
import AdminModal from './AdminModal';
import './index.css';

// 시간 파싱 유틸리티
const parseTimeStr = (str) => {
  if (!str) return [];
  const regex = /([월화수목금토일])\s*\(([0-9]{2}:[0-9]{2})-([0-9]{2}:[0-9]{2})\)/g;
  let match;
  const slots = [];

  while ((match = regex.exec(str)) !== null) {
    slots.push({
      day: match[1].trim(),
      start: match[2].trim(),
      end: match[3].trim()
    });
  }

  // 연속된 시간표 합치기 (예: 13:00-14:00 / 14:00-15:00 -> 13:00-15:00)
  const grouped = {};
  slots.forEach(s => {
    if (!grouped[s.day]) grouped[s.day] = [];
    grouped[s.day].push(s);
  });

  const merged = [];
  for (const day in grouped) {
    const daySlots = grouped[day].sort((a, b) => a.start.localeCompare(b.start));
    let current = { ...daySlots[0] };
    for (let i = 1; i < daySlots.length; i++) {
      const next = daySlots[i];
      if (current.end >= next.start) {
        if (next.end > current.end) current.end = next.end;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
  }
  return merged;
};

const timeToRowIndex = (timeStr, baseHour = 9) => {
  const [hours, mins] = timeStr.split(':').map(Number);
  return (hours - baseHour) * 2 + (mins >= 30 ? 1 : 0);
};

const DAYS = ['월', '화', '수', '목', '금'];
const TIME_LABELS = Array.from({ length: 11 }, (_, i) => `${i + 9}:00`);

const isSpecialCourse = (course) => {
  if (!course || !course.name) return false;
  const name = course.name.replace(/\s+/g, '');
  if (name.includes('캡스톤') || name.includes('연구심화')) return true;
  if (course.timeSlots && course.timeSlots.some(s => s.day === '토')) return true;
  if (course.timeStr && course.timeStr.includes('토(')) return true;
  return false;
};

const COURSE_COLORS = [
  '#e29c5a', // 1
  '#6e8fcb', // 2
  '#93c46e', // 3
  '#a382cf', // 4
  '#64b5aa', // 5
  '#e07a6e', // 6
  '#7b9d74'  // 7
];

const COLLEGE_MAPPING = {
  "소프트웨어융합대학": [
    "ICT융합학부",
    "데이터인텔리전스전공",
    "디자인컨버전스전공",
    "디자인테크놀로지전공",
    "미디어테크놀로지전공",
    "컬처테크놀로지전공",
    "수리데이터사이언스학과",
    "융합보안학과",
    "인공지능학과",
    "컴퓨터학부"
  ],
  "LIONS칼리지": [
    "LIONS자율전공학부(인문사회계열)",
    "LIONS자율전공학부(자연계열)",
    "LIONS자율전공학부(전계열)",
    "학생설계전공학부"
  ],
  "경상대학": [
    "경영학부",
    "경제학부",
    "보험계리학과",
    "회계세무학과"
  ],
  "공학대학": [
    "건설환경공학과",
    "건축공학전공",
    "건축학전공",
    "건축학부",
    "교통·물류공학과",
    "기계공학과",
    "로봇공학과",
    "배터리소재화학공학과",
    "산업경영공학과",
    "스마트융합학부",
    "건축IT융합전공",
    "로봇융합전공",
    "소재·부품융합전공",
    "스마트ICT융합전공",
    "스마트건축구조시공융합전공",
    "스마트컨스트럭션융합전공",
    "지속가능건축융합전공",
    "에너지바이오학과",
    "융합시스템공학과",
    "재료화학공학과",
    "전자공학부",
    "지능형로봇학과",
    "해양융합공학과"
  ],
  "국제문화대학": [
    "영미언어·문화학과",
    "일본학과",
    "중국학과",
    "프랑스학과",
    "한국언어문학과"
  ],
  "약학대학": [
    "약학과"
  ],
  "디자인대학": [
    "디자인계열",
    "산업디자인학과",
    "영상디자인학과",
    "융합디자인학부",
    "주얼리·패션디자인학과",
    "커뮤니케이션디자인학과"
  ],
  "글로벌문화통상대학": [
    "글로벌문화통상학부"
  ],
  "연계전공대학": [
    "융합전공학과",
    "글로벌전략커뮤니케이션전공",
    "디자인공학전공",
    "비즈니스애널리틱스전공",
    "산업인공지능전공",
    "신산업소프트웨어전공",
    "지능형시스템반도체전공"
  ],
  "예체능대학": [
    "무용예술학과",
    "스포츠과학부",
    "스포츠문화전공",
    "스포츠코칭전공",
    "실용음악학과"
  ],
  "첨단융합대학": [
    "국방지능정보융합공학부",
    "국방전략기술공학과",
    "지능정보양자공학전공",
    "바이오신약융합학부",
    "바이오나노공학전공",
    "분자의약전공",
    "차세대반도체융합공학부",
    "반도체·디스플레이공학전공",
    "신소재·반도체공학전공"
  ],
  "커뮤니케이션&컬처대학": [
    "광고홍보학과",
    "문화인류학과",
    "문화콘텐츠학과",
    "미디어학과"
  ]
};

function App() {
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCollege, setSelectedCollege] = useState('전체');
  const [selectedDept, setSelectedDept] = useState('전체');
  const [selectedGrade, setSelectedGrade] = useState('전체');
  const [selectedCredit, setSelectedCredit] = useState('전체');
  const [selectedCourseType, setSelectedCourseType] = useState('전체');
  const [selectedArea, setSelectedArea] = useState('전체');
  const [selectedExactSlots, setSelectedExactSlots] = useState([]);
  const [isStrictMode, setIsStrictMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState(null); // 'select' or 'deselect'
  const [isTimeSelectMode, setIsTimeSelectMode] = useState(false);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 1024);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);
  const [displayCount, setDisplayCount] = useState(50);

  const [myTimetable, setMyTimetable] = useState([]);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const [timetableName, setTimetableName] = useState('내 시간표');
  const [showTitleMenu, setShowTitleMenu] = useState(false);
  const [mobileTab, setMobileTab] = useState('timetable'); // 'timetable' or 'search'
  const [savedTimetables, setSavedTimetables] = useState([]);
  const [showSavedList, setShowSavedList] = useState(false);
  const [authInfo, setAuthInfo] = useState(null); // null = 선택 전, { type: 'guest'|'member', user } 
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [mobilePreviewCourse, setMobilePreviewCourse] = useState(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState(null);
  const timetableRef = useRef(null);

  const getUserId = () => {
    let uid = localStorage.getItem('timetable_user_id');
    if (!uid) {
      uid = crypto.randomUUID();
      localStorage.setItem('timetable_user_id', uid);
    }
    return uid;
  };

  // localStorage에서 로그인 상태 복원
  useEffect(() => {
    const saved = localStorage.getItem('app_user');
    if (saved) {
      try {
        const user = JSON.parse(saved);
        setAuthInfo({ type: 'member', user });
      } catch { }
    }
  }, []);

  // 로그인 시 회원 맞춤 데이터(단과대, 저장된 시간표) 세팅
  useEffect(() => {
    if (authInfo?.type === 'member') {
      const fetchTimetables = async () => {
        const { data } = await supabase
          .from('timetables')
          .select('id, name, course_ids, created_at')
          .eq('app_user_id', authInfo.user.id)
          .order('created_at', { ascending: false });
        if (data) setSavedTimetables(data);
      };
      fetchTimetables();

      if (authInfo.user.college) setSelectedCollege(authInfo.user.college);
      if (authInfo.user.department) setSelectedDept(authInfo.user.department);
    } else {
      setSavedTimetables([]);
    }
  }, [authInfo]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        let allData = [];
        let from = 0;
        const step = 1000;

        while (true) {
          const { data, error } = await supabase
            .from('courses')
            .select('*')
            .range(from, from + step - 1);

          if (error) throw error;
          if (!data || data.length === 0) break;
          allData = allData.concat(data);
          if (data.length < step) break;
          from += step;
        }

        const { data: allTimetables } = await supabase.from('timetables').select('app_user_id, course_ids');
        const pickupMap = {};
        if (allTimetables) {
          allTimetables.forEach(t => {
            if (!t.app_user_id || !t.course_ids) return;
            t.course_ids.forEach(cid => {
              if (!pickupMap[cid]) pickupMap[cid] = new Set();
              pickupMap[cid].add(t.app_user_id);
            });
          });
        }

        allData = allData.map(c => {
          if (c.name && c.name.includes('자연어') && (c.time_str === '집중수업' || c.id === 4141)) {
            return { ...c, time_str: '화(13:00-16:00)\r\n목(13:00-16:00)' };
          }
          return c;
        });

        const processedData = allData.map((row, index) => {
          let uniqueRoom = row.room || '';
          if (uniqueRoom.includes(',')) {
            uniqueRoom = [...new Set(uniqueRoom.split(',').map(r => r.trim()))].join(', ');
          }

          let capacityTotal = 0;
          if (row.capacity && row.capacity.includes('/')) {
            capacityTotal = parseInt(row.capacity.split('/')[1], 10);
          } else if (row.capacity) {
            capacityTotal = parseInt(row.capacity, 10);
          }

          return {
            id: row.id,
            code: row.course_code,
            name: row.name,
            professor: row.professor,
            credits: row.credits,
            classification: row.classification,
            course_type: row.course_type || '',
            area: row.area || row.classification || '',
            capacity: row.capacity || '',
            capacityTotal: isNaN(capacityTotal) ? 0 : capacityTotal,
            detail: row.detail || '',
            pickupCount: pickupMap[row.id] ? pickupMap[row.id].size : 0,
            department: row.department || '전체',
            targetGrade: row.target_grade || '공통',
            timeStr: row.time_str,
            room: uniqueRoom,
            timeSlots: parseTimeStr(row.time_str),
            colorIndex: index % 7,
          };
        });

        const seen = new Map();
        const uniqueProcessed = [];

        for (const course of processedData) {
          const key = `${course.name}|${course.timeStr}`;
          if (seen.has(key)) {
            const existingCourse = seen.get(key);
            if (course.department) {
              existingCourse.department = existingCourse.department || '';
              if (!existingCourse.department.includes(course.department)) {
                existingCourse.department = existingCourse.department ? `${existingCourse.department}, ${course.department}` : course.department;
              }
            }
            if (course.professor) {
              existingCourse.professor = existingCourse.professor || '';
              if (!existingCourse.professor.includes(course.professor)) {
                existingCourse.professor = existingCourse.professor ? `${existingCourse.professor}, ${course.professor}` : course.professor;
              }
            }
          } else {
            seen.set(key, course);
            uniqueProcessed.push(course);
          }
        }

        setAllCourses(uniqueProcessed);

        const urlParams = new URLSearchParams(window.location.search);
        const timetableId = urlParams.get('id');
        if (timetableId) {
          const { data: tbData, error: tbError } = await supabase
            .from('timetables')
            .select('course_ids, name')
            .eq('id', timetableId)
            .single();

          if (tbData && !tbError) {
            const savedCourses = uniqueProcessed.filter(c => tbData.course_ids.includes(String(c.id)));
            setMyTimetable(savedCourses);
            if (tbData.name) setTimetableName(tbData.name);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const allDepartments = useMemo(() => {
    const depts = new Set();
    allCourses.forEach(course => {
      if (course.department) {
        course.department.split(',').forEach(d => depts.add(d.trim()));
      }
    });
    return ['전체', ...Array.from(depts).sort()];
  }, [allCourses]);

  const availableDepartments = useMemo(() => {
    if (selectedCollege === '전체') {
      return allDepartments;
    } else if (COLLEGE_MAPPING[selectedCollege]) {
      return ['전체', ...COLLEGE_MAPPING[selectedCollege]];
    } else {
      return ['전체'];
    }
  }, [selectedCollege, allDepartments]);

  useEffect(() => {
    setSelectedDept('전체');
  }, [selectedCollege]);

  const allAreas = useMemo(() => {
    const areas = new Set(allCourses.map(c => c.area).filter(Boolean));
    return ['전체', ...Array.from(areas).sort()];
  }, [allCourses]);

  const allCourseTypes = useMemo(() => {
    const typeCounts = {};
    allCourses.forEach(c => {
      if (c.course_type) {
        typeCounts[c.course_type] = (typeCounts[c.course_type] || 0) + 1;
      }
    });
    const sortedTypes = Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a]);
    return ['전체', ...sortedTypes];
  }, [allCourses]);

  const grades = ['전체', '1', '2', '3', '4', '5', '6', '공통'];
  const days = ['전체', '월', '화', '수', '목', '금', '토', '일'];
  const times = ['전체', '오전(12시 이전)', '오후(12시~18시)', '야간(18시 이후)'];

  const filteredCourses = useMemo(() => {
    return allCourses.filter(course => {
      // 1. 단과대 1차 필터
      if (selectedCollege !== '전체') {
        const allowedDepts = COLLEGE_MAPPING[selectedCollege] || [];
        const courseDepts = (course.department || '').split(',').map(d => d.trim());
        const hasAllowedDept = courseDepts.some(d => allowedDepts.includes(d));
        if (!hasAllowedDept) {
          return false;
        }
      }

      // 2. 단과대학/학과 필터
      if (selectedCollege !== '전체' && selectedDept !== '전체') {
        const courseDepts = (course.department || '').split(',').map(d => d.trim());
        if (!courseDepts.includes(selectedDept)) return false;
      }
      // 3. 학년 필터
      if (selectedGrade !== '전체') {
        if (course.targetGrade !== selectedGrade) return false;
      }

      // 학점 필터
      if (selectedCredit !== '전체') {
        if (String(course.credits) !== selectedCredit) return false;
      }

      // 이수구분 필터
      if (selectedCourseType !== '전체') {
        if ((course.course_type || '') !== selectedCourseType) return false;
      }

      // 영역 필터
      if (selectedArea !== '전체') {
        if ((course.area || '') !== selectedArea) return false;
      }

      // 4. 검색어 필터
      if (searchTerm) {
        const term = searchTerm.replace(/\s+/g, '').toLowerCase();
        const courseName = (course.name || '').replace(/\s+/g, '').toLowerCase();
        const courseCode = (course.code || '').replace(/\s+/g, '').toLowerCase();
        if (!courseName.includes(term) && !courseCode.includes(term)) return false;
      }

      // 5. 요일/시간 필터 (정밀 검색 모드)
      if (selectedExactSlots.length > 0) {
        if (!course.timeSlots || course.timeSlots.length === 0) return false;

        const courseChunks = [];
        for (const cSlot of course.timeSlots) {
          const startMin = parseInt(cSlot.start.split(':')[0]) * 60 + parseInt(cSlot.start.split(':')[1]);
          const endMin = parseInt(cSlot.end.split(':')[0]) * 60 + parseInt(cSlot.end.split(':')[1]);

          const chunks = [];
          for (let m = startMin; m < endMin; m += 30) {
            const h = Math.floor(m / 60).toString().padStart(2, '0');
            const mn = (m % 60).toString().padStart(2, '0');
            chunks.push(`${cSlot.day}-${h}:${mn}`);
          }
          courseChunks.push({ day: cSlot.day, chunks });
        }

        const selectedSet = new Set(selectedExactSlots.map(s => `${s.day}-${s.start}`));

        if (isStrictMode) {
          // 엄격 모드: 과목의 '모든' 수업시간이 선택된 영역 안에 '완전히' 들어가야 함
          const allChunksMatch = courseChunks.every(c => c.chunks.every(chunk => selectedSet.has(chunk)));
          if (!allChunksMatch) return false;
        } else {
          // 일반 모드: 과목의 여러 시간대 중 '일부'라도 선택된 영역과 '겹치면' 됨
          const anyOverlap = courseChunks.some(c => c.chunks.some(chunk => selectedSet.has(chunk)));
          if (!anyOverlap) return false;
        }
      }
      return true;
    });
  }, [allCourses, selectedCollege, selectedDept, selectedGrade, selectedCredit, selectedCourseType, selectedArea, searchTerm, selectedExactSlots, isStrictMode]);

  useEffect(() => {
    setDisplayCount(50);
  }, [filteredCourses]);

  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    // 맨 밑으로 스크롤 시 50개씩 추가 로드
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (displayCount < filteredCourses.length) {
        setDisplayCount(prev => prev + 50);
      }
    }
  };

  const executeAddCourse = (course, isMobileOverwrite = false) => {
    let conflictingCourses = [];
    if (course.timeSlots) {
      course.timeSlots.forEach(newSlot => {
        myTimetable.forEach(existing => {
          existing.timeSlots?.forEach(exSlot => {
            if (newSlot.day === exSlot.day) {
              if ((newSlot.start >= exSlot.start && newSlot.start < exSlot.end) ||
                (newSlot.end > exSlot.start && newSlot.end <= exSlot.end) ||
                (newSlot.start <= exSlot.start && newSlot.end >= exSlot.end)) {
                if (!conflictingCourses.includes(existing)) {
                  conflictingCourses.push(existing);
                }
              }
            }
          });
        });
      });
    }

    if (conflictingCourses.length > 0) {
      if (isMobileOverwrite) {
        if (!window.confirm("해당 시간에 이미 과목이 있습니다. 겹치는 과목은 삭제되는데 추가하시겠습니까?")) {
          return;
        }
      } else {
        alert("시간이 겹치는 과목이 있습니다!");
        return;
      }
    }

    const usedColors = new Set(myTimetable.map(c => c.colorIndex % 7));
    let nextColorIndex = 0;
    while (usedColors.has(nextColorIndex % 7) && nextColorIndex < 7) {
      nextColorIndex++;
    }
    const newCourse = { ...course, colorIndex: nextColorIndex };

    let nextTimetable = myTimetable;
    if (isMobileOverwrite && conflictingCourses.length > 0) {
      const conflictingCodes = conflictingCourses.map(c => c.code);
      nextTimetable = myTimetable.filter(c => !conflictingCodes.includes(c.code));
    }

    setMyTimetable([...nextTimetable, newCourse]);
    setShareUrl('');
    setIsFilterCollapsed(false);

    // 로컬 상태만 증가 (동일 계정의 다른 저장된 시간표에 이미 존재한다면 카운트 증가 생략)
    const alreadyHas = savedTimetables.some(tbl => tbl.course_ids?.map(String).includes(String(course.id)));
    if (!alreadyHas) {
      setAllCourses(prev => prev.map(c => c.id === course.id ? { ...c, pickupCount: (c.pickupCount || 0) + 1 } : c));
    }
  };

  const addCourse = (course) => {
    if (myTimetable.some(c => c.code === course.code)) return;

    const hasNoTime = !course.timeSlots || course.timeSlots.length === 0 || isSpecialCourse(course);

    if (isMobileView && !hasNoTime) {
      setMobilePreviewCourse(course);
      setMobileTab('timetable');
    } else {
      if (isMobileView && hasNoTime) {
        if (!window.confirm(`[${course.name}] 과목은 시간이 지정되지 않았습니다. 바로 추가하시겠습니까?`)) {
          return;
        }
      }
      executeAddCourse(course, false);
    }
  };

  const removeCourse = (courseCode) => {
    if (window.innerWidth <= 1024) {
      const courseToRemove = myTimetable.find(c => c.code === courseCode);
      if (courseToRemove && !window.confirm(`[${courseToRemove.name}] 과목을 시간표에서 삭제하시겠습니까?`)) {
        return;
      }
    }
    setMyTimetable(myTimetable.filter(c => c.code !== courseCode));
    setShareUrl('');
    // 로컬 상태만 감소 (다른 저장된 시간표에 아직 해당 과목이 남아있다면 카운트 감소 생략)
    const courseToDecrement = myTimetable.find(c => c.code === courseCode);
    if (courseToDecrement) {
      const stillHas = savedTimetables.some(tbl => tbl.course_ids?.map(String).includes(String(courseToDecrement.id)));
      if (!stillHas) {
        setAllCourses(prev => prev.map(c => c.id === courseToDecrement.id ? { ...c, pickupCount: Math.max((c.pickupCount || 0) - 1, 0) } : c));
      }
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setDragMode(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);

    const handleResize = () => setIsMobileView(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleDayHeaderClick = (day) => {
    const allDaySlots = [];
    for (let idx = 0; idx < 11; idx++) { // 09:00 ~ 20:00
      const hourStr = (idx + 9).toString().padStart(2, '0');
      allDaySlots.push({ day, start: `${hourStr}:00`, end: `${hourStr}:30` });
      allDaySlots.push({ day, start: `${hourStr}:30`, end: `${(idx + 10).toString().padStart(2, '0')}:00` });
    }

    const isAllSelected = allDaySlots.every(slot =>
      selectedExactSlots.some(s => s.day === slot.day && s.start === slot.start)
    );

    if (isAllSelected) {
      setSelectedExactSlots(prev => prev.filter(s => s.day !== day));
    } else {
      setSelectedExactSlots(prev => {
        const next = prev.filter(s => s.day !== day);
        return [...next, ...allDaySlots];
      });
    }
  };

  const getSlotObj = (day, timeIdx, isHalf) => {
    const hour = timeIdx + 9;
    const startMins = isHalf ? '30' : '00';
    const endHour = isHalf ? hour + 1 : hour;
    const endMins = isHalf ? '00' : '30';
    const formatTime = (h, m) => `${h.toString().padStart(2, '0')}:${m}`;
    return { day, start: formatTime(hour, startMins), end: formatTime(endHour, endMins) };
  };

  const applyDragSelection = (slotObj, mode) => {
    setSelectedExactSlots(prev => {
      const exists = prev.find(s => s.day === slotObj.day && s.start === slotObj.start);
      if (mode === 'select' && !exists) {
        return [...prev, slotObj];
      } else if (mode === 'deselect' && exists) {
        return prev.filter(s => !(s.day === slotObj.day && s.start === slotObj.start));
      }
      return prev;
    });
  };

  const handleEmptyCellMouseDown = (day, timeIdx, isHalf) => {
    const slotObj = getSlotObj(day, timeIdx, isHalf);
    const isSelected = selectedExactSlots.some(s => s.day === slotObj.day && s.start === slotObj.start);
    const newMode = isSelected ? 'deselect' : 'select';
    setIsDragging(true);
    setDragMode(newMode);
    applyDragSelection(slotObj, newMode);
  };

  const handleEmptyCellMouseEnter = (day, timeIdx, isHalf) => {
    if (!isDragging || !dragMode) return;
    const slotObj = getSlotObj(day, timeIdx, isHalf);
    applyDragSelection(slotObj, dragMode);
  };

  const handleFilterChange = (setter, value) => {
    setter(value);
  };

  const saveTimetable = async () => {
    if (myTimetable.length === 0) {
      alert('시간표에 과목을 먼저 추가해주세요!');
      return;
    }
    if (!authInfo || authInfo.type !== 'member') {
      alert('시간표 저장은 회원만 가능합니다.\n회원으로 로그인 해주세요!');
      return;
    }
    const appUserId = authInfo.user.id;

    // 저장 수 체크
    const { count } = await supabase
      .from('timetables')
      .select('id', { count: 'exact', head: true })
      .eq('app_user_id', appUserId);

    if (count >= 3) {
      alert(`시간표는 최대 3개까지 저장할 수 있습니다.\n[${savedTimetables.map(t => t.name).join(', ')}]\n\n저장된 시간표 중 하나를 먼저 삭제해주세요.`);
      return;
    }

    setSaving(true);
    const courseIds = myTimetable.map(c => String(c.id));
    try {
      const { data, error } = await supabase
        .from('timetables')
        .insert([{ course_ids: courseIds, app_user_id: appUserId, name: timetableName }])
        .select()
        .single();

      if (error) throw error;

      setSavedTimetables(prev => [data, ...prev]);
      const newUrl = `${window.location.origin}?id=${data.id}`;
      setShareUrl(newUrl);
      window.history.pushState({}, '', `?id=${data.id}`);
      alert(`"${timetableName}" 저장 완료! (${count + 1}/3)`);
    } catch (err) {
      console.error(err);
      alert('저장 실패. DB 연동을 확인해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const downloadTimetableImage = async () => {
    if (!timetableRef.current) return;
    try {
      // 스크롤 위치 백업
      const prevX = window.scrollX;
      const prevY = window.scrollY;

      // 스크롤을 맨 위로 일시적으로 올림 (html2canvas 오프셋 버그 방지)
      window.scrollTo(0, 0);
      await new Promise(resolve => setTimeout(resolve, 50));

      const canvas = await html2canvas(timetableRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      // 스크롤 위치 복구
      window.scrollTo(prevX, prevY);

      const imgData = canvas.toDataURL('image/png');
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobileDevice) {
        setCapturedImageUrl(imgData);
      } else {
        const link = document.createElement('a');
        link.download = `${timetableName || '시간표'}.png`;
        link.href = imgData;
        link.click();
      }
    } catch (err) {
      console.error(err);
      alert('이미지 다운로드에 실패했습니다.');
    }
  };

  const deleteSavedTimetable = async (id) => {
    if (!confirm('저장된 시간표를 삭제하시겠습니까?')) return;
    await supabase.from('timetables').delete().eq('id', id);
    setSavedTimetables(prev => prev.filter(t => t.id !== id));
  };

  const loadSavedTimetable = (tbl, allCoursesData) => {
    const courses = (allCoursesData || allCourses).filter(c => tbl.course_ids.includes(String(c.id)));
    setMyTimetable(courses);
    setTimetableName(tbl.name || '내 시간표');
    const newUrl = `${window.location.origin}?id=${tbl.id}`;
    window.history.pushState({}, '', `?id=${tbl.id}`);
    setShowSavedList(false);
  };

  const renderCourseBlocks = (baseHour, totalRows) => {
    const blocks = [];
    myTimetable.forEach(course => {
      if (isSpecialCourse(course)) return;
      course.timeSlots?.forEach(slot => {
        const dayIdx = DAYS.indexOf(slot.day);
        if (dayIdx === -1) return;

        let startRow = timeToRowIndex(slot.start, baseHour);
        let endRow = timeToRowIndex(slot.end, baseHour);

        if (startRow < 0) startRow = 0;
        if (startRow >= totalRows) return;
        if (endRow > totalRows) endRow = totalRows;
        if (startRow >= endRow) return;

        const span = endRow - startRow;

        const gridColumn = dayIdx + 2;
        const gridRow = startRow + 2;

        blocks.push(
          <div
            key={`${course.code}-${slot.day}-${slot.start}`}
            className="course-block"
            style={{
              position: 'relative',
              gridColumn,
              gridRow: `${gridRow} / span ${span}`,
              backgroundColor: COURSE_COLORS[course.colorIndex % 7],
              color: '#ffffff',
              opacity: isTimeSelectMode ? 0.2 : 1,
              pointerEvents: isTimeSelectMode ? 'none' : 'auto',
              zIndex: 10
            }}
            onClick={() => {
              if (!isTimeSelectMode) removeCourse(course.code);
            }}
            title="클릭하여 삭제"
          >
            <div className="title" style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap', color: '#ffffff' }}>
              <span className="course-title-text" style={{ fontWeight: '800' }}>{course.name}</span>
              {/pbl/i.test(course.detail) || /pbl/i.test(course.name) ? <span className="course-tag-text" style={{ fontSize: '0.6rem', fontWeight: '800', color: '#ffeb3b', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>(PBL)</span> : null}
              {/(영어전용|영어|원어)/.test(course.detail) ? <span className="course-tag-text" style={{ fontSize: '0.6rem', fontWeight: '800', color: '#ffeb3b', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>(영어)</span> : null}
            </div>
            <div className="room" style={{ color: 'rgba(255,255,255,0.95)', fontWeight: '500' }}>{course.room || course.professor}</div>
          </div>
        );
      });
    });

    // 미리보기 블럭 렌더링
    const renderPreviewCourse = (previewCourse) => {
      if (!previewCourse) return;
      if (myTimetable.some(c => c.code === previewCourse.code)) return;
      if (isSpecialCourse(previewCourse)) return;

      previewCourse.timeSlots?.forEach(slot => {
        const dayIdx = DAYS.indexOf(slot.day);
        if (dayIdx === -1) return;

        let startRow = timeToRowIndex(slot.start, baseHour);
        let endRow = timeToRowIndex(slot.end, baseHour);

        if (startRow < 0) startRow = 0;
        if (startRow >= totalRows) return;
        if (endRow > totalRows) endRow = totalRows;
        if (startRow >= endRow) return;

        const span = endRow - startRow;

        const gridColumn = dayIdx + 2;
        const gridRow = startRow + 2;

        blocks.push(
          <div
            key={`preview-${previewCourse.code}-${slot.day}-${slot.start}`}
            className="course-block"
            style={{
              gridColumn,
              gridRow: `${gridRow} / span ${span}`,
              backgroundColor: `rgba(92, 107, 192, 0.6)`,
              border: `2px dashed var(--primary)`,
              zIndex: 20,
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(92, 107, 192, 0.4)',
              animation: 'pulse 1.5s infinite'
            }}
          >
            <div className="title" style={{ color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', fontWeight: 'bold' }}>{previewCourse.name} (미리보기)</div>
            <div className="room" style={{ color: '#eee', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{previewCourse.room || previewCourse.professor}</div>
          </div>
        );
      });
    };

    if (hoveredCourse) renderPreviewCourse(hoveredCourse);
    if (mobilePreviewCourse && (!hoveredCourse || mobilePreviewCourse.code !== hoveredCourse.code)) renderPreviewCourse(mobilePreviewCourse);

    return blocks;
  };

  const [hoveredCourse, setHoveredCourse] = useState(null);

  const handleGridTouchMove = (e) => {
    // 메인 시간표에서는 작동하지 않고 모달에서만 isDragging이 켜질 수 있습니다.
    if (!isDragging) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.dataset && el.dataset.day) {
      handleEmptyCellMouseEnter(el.dataset.day, parseInt(el.dataset.timeidx), el.dataset.ishalf === 'true');
    }
  };

  const getTimetableDays = (isModal) => {
    const baseDays = ['월', '화', '수', '목', '금'];
    if (isModal) return [...baseDays, '토'];

    const coursesToCheck = [...myTimetable];
    if (hoveredCourse) coursesToCheck.push(hoveredCourse);
    if (mobilePreviewCourse) coursesToCheck.push(mobilePreviewCourse);

    const hasSaturday = coursesToCheck.some(c =>
      !isSpecialCourse(c) && c.timeSlots && c.timeSlots.some(s => s.day === '토')
    );

    return hasSaturday ? [...baseDays, '토'] : baseDays;
  };

  const renderTimetableGrid = () => {
    const canSelect = isTimeSelectMode;
    let earliestHour = 9;
    let latestHour = 15; // 기본 최소 15시까지

    if (isTimeSelectMode) {
      earliestHour = 9;
      latestHour = 20; // 정밀 선택 모드(모달)일 때만 항상 20시까지 노출
    } else {
      const coursesToCheck = [...myTimetable];
      if (hoveredCourse) coursesToCheck.push(hoveredCourse);
      if (mobilePreviewCourse) coursesToCheck.push(mobilePreviewCourse);

      let minStart = 24;
      let maxEnd = 0;

      coursesToCheck.forEach(course => {
        if (!isSpecialCourse(course) && course.timeSlots) {
          course.timeSlots.forEach(slot => {
            const [startH] = slot.start.split(':').map(Number);
            const [endH, endM] = slot.end.split(':').map(Number);
            const slotEndH = endM > 0 ? endH + 1 : endH;
            if (startH < minStart) minStart = startH;
            if (slotEndH > maxEnd) maxEnd = slotEndH;
          });
        }
      });

      if (minStart !== 24 && maxEnd !== 0) {
        earliestHour = Math.min(9, minStart);
        latestHour = Math.max(15, maxEnd);
      }
    }

    const displayHours = latestHour - earliestHour;
    const totalRows = displayHours * 2;

    const localTimeLabels = [];
    for (let i = earliestHour; i < latestHour; i++) {
      localTimeLabels.push(i.toString().padStart(2, '0'));
    }

    const activeDays = getTimetableDays(isTimeSelectMode);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundColor: '#ffffff' }}>
        <div
          className="timetable-grid"
          onTouchMove={canSelect ? handleGridTouchMove : undefined}
          style={{
            gridTemplateRows: `${isMobileView ? '22px' : '40px'} repeat(${totalRows}, minmax(${isMobileView ? '18px' : '26px'}, 1fr))`,
            gridTemplateColumns: `${isMobileView ? '24px' : '50px'} repeat(${activeDays.length}, 1fr)`,
            paddingBottom: (isMobileView && mobilePreviewCourse) ? '220px' : '0'
          }}
        >
          <div className="timetable-cell timetable-header" style={{ position: 'sticky', top: 0, left: 0, zIndex: 60 }}></div>
          {activeDays.map(day => (
            <div
              key={day}
              className="timetable-cell timetable-header"
              style={{
                position: 'sticky', top: 0, zIndex: 50,
                cursor: canSelect ? 'pointer' : 'default',
                transition: 'background-color 0.2s',
                borderBottom: '2px solid var(--primary)'
              }}
              onClick={canSelect ? () => handleDayHeaderClick(day) : undefined}
              title={canSelect ? `${day}요일 전체 선택/해제` : undefined}
              onMouseEnter={(e) => { if (canSelect) e.target.style.backgroundColor = 'rgba(92, 107, 192, 0.15)'; }}
              onMouseLeave={(e) => { if (canSelect) e.target.style.backgroundColor = '#f4f5fa'; }}
            >
              {day}
            </div>
          ))}

          {localTimeLabels.map((time, idx) => (
            <React.Fragment key={time}>
              <div className="timetable-cell timetable-time-label" style={{ gridColumn: 1, gridRow: `${idx * 2 + 2} / span 2`, position: 'sticky', left: 0, zIndex: 40 }}>
                {time}
              </div>
              {activeDays.map((day, dIdx) => {
                const hourStr = (idx + earliestHour).toString().padStart(2, '0');
                const slot1Start = `${hourStr}:00`;
                const slot2Start = `${hourStr}:30`;

                const isSlot1Selected = canSelect ? selectedExactSlots.some(s => s.day === day && s.start === slot1Start) : false;
                const isSlot2Selected = canSelect ? selectedExactSlots.some(s => s.day === day && s.start === slot2Start) : false;

                return (
                  <React.Fragment key={`${day}-${time}`}>
                    <div
                      className={`timetable-cell ${canSelect ? 'empty-cell-hover' : ''} ${isSlot1Selected ? 'selected-cell' : ''}`}
                      style={{ gridColumn: dIdx + 2, gridRow: idx * 2 + 2, borderBottom: '1px dashed #e2e6eb', cursor: canSelect ? 'crosshair' : 'default', userSelect: 'none' }}
                      data-day={canSelect ? day : undefined} data-timeidx={canSelect ? idx : undefined} data-ishalf={false}
                      onMouseDown={canSelect ? () => handleEmptyCellMouseDown(day, idx, false) : undefined}
                      onMouseEnter={canSelect ? () => handleEmptyCellMouseEnter(day, idx, false) : undefined}
                      onTouchStart={canSelect ? () => handleEmptyCellMouseDown(day, idx, false) : undefined}
                      title={canSelect ? `${day}요일 ${time} 시간대 정밀 선택 (클릭 후 드래그)` : undefined}
                    ></div>
                    <div
                      className={`timetable-cell ${canSelect ? 'empty-cell-hover' : ''} ${isSlot2Selected ? 'selected-cell' : ''}`}
                      style={{ gridColumn: dIdx + 2, gridRow: idx * 2 + 3, cursor: canSelect ? 'crosshair' : 'default', userSelect: 'none' }}
                      data-day={canSelect ? day : undefined} data-timeidx={canSelect ? idx : undefined} data-ishalf={true}
                      onMouseDown={canSelect ? () => handleEmptyCellMouseDown(day, idx, true) : undefined}
                      onMouseEnter={canSelect ? () => handleEmptyCellMouseEnter(day, idx, true) : undefined}
                      onTouchStart={canSelect ? () => handleEmptyCellMouseDown(day, idx, true) : undefined}
                      title={canSelect ? `${day}요일 ${slot2Start} 시간대 정밀 선택 (클릭 후 드래그)` : undefined}
                    ></div>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ))}

          {renderCourseBlocks(earliestHour, totalRows)}
        </div>

        {!isTimeSelectMode && myTimetable.some(c => !c.timeSlots || c.timeSlots.length === 0 || isSpecialCourse(c)) && (
          <div className="special-courses-container" style={{ padding: '12px', borderTop: '2px dashed #e2e6eb', backgroundColor: '#fafbfc' }}>
            <strong className="special-course-header" style={{ fontSize: '0.85rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              📌 캡스톤 / 실습 / 시간 미지정 과목
            </strong>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {myTimetable.filter(c => !c.timeSlots || c.timeSlots.length === 0 || isSpecialCourse(c)).map(course => (
                <div key={course.code} className="special-course-tag" style={{ padding: '6px 10px', backgroundColor: COURSE_COLORS[course.colorIndex % 7], color: '#ffffff', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <span className="special-course-text">{course.name}</span>
                  <button className="special-course-remove" onClick={() => removeCourse(course.code)} style={{ background: 'rgba(0,0,0,0.2)', border: 'none', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  };

  return (
    <>
      {!authInfo && <AuthModal onAuth={setAuthInfo} collegeMapping={COLLEGE_MAPPING} />}
      <div className={`layout-container tab-${mobileTab}`}>

        {/* 상단 로그인 정보 통합 (아래 header-btn-group으로 이동됨) */}

        <section ref={timetableRef} className="glass-panel timetable-section" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div className="header-top-row">
            <div className="header-title-group">
              <h1
                className="header-title"
                onClick={() => setShowTitleMenu(!showTitleMenu)}
              >
                {timetableName}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </h1>

              {showTitleMenu && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '0.5rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, overflow: 'hidden', minWidth: '160px' }}>
                  <div
                    style={{ padding: '0.8rem 1rem', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid #eee' }}
                    onClick={() => {
                      const newName = prompt("새로운 시간표 이름을 입력하세요:", timetableName);
                      if (newName) setTimetableName(newName);
                      setShowTitleMenu(false);
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >이름 수정</div>
                  <div
                    style={{ padding: '0.8rem 1rem', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid #eee' }}
                    onClick={() => {
                      if (confirm("현재 시간표를 초기화하고 새 시간표를 만드시겠습니까?")) {
                        setMyTimetable([]);
                        setTimetableName('새 시간표');
                        setShareUrl('');
                        window.history.pushState({}, '', window.location.pathname);
                      }
                      setShowTitleMenu(false);
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >새 시간표 만들기</div>
                </div>
              )}

              {/* 내 저장된 시간표 목록 */}
              <div style={{ position: 'relative' }} data-html2canvas-ignore="true">
                <button
                  className="header-folder-btn"
                  onClick={() => setShowSavedList(v => !v)}
                >
                  📂 <span className="hide-on-mobile">내 시간표</span> {savedTimetables.length > 0 ? `(${savedTimetables.length}/3)` : ''}
                </button>
                {showSavedList && (
                  <div style={{ position: 'absolute', top: '110%', left: 0, backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', zIndex: 200, minWidth: '220px', overflow: 'hidden' }}>
                    {savedTimetables.length === 0 ? (
                      <div style={{ padding: '1rem', color: '#888', fontSize: '0.85rem' }}>저장된 시간표가 없습니다.</div>
                    ) : savedTimetables.map(tbl => (
                      <div key={tbl.id} style={{ display: 'flex', alignItems: 'center', padding: '0.7rem 1rem', borderBottom: '1px solid #eee', gap: '0.5rem' }}>
                        <span
                          style={{ flex: 1, cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', color: 'var(--primary)' }}
                          onClick={() => loadSavedTimetable(tbl)}
                        >{tbl.name || '내 시간표'}</span>
                        <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{tbl.course_ids?.length}과목</span>
                        <button onClick={() => deleteSavedTimetable(tbl.id)} style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <span className="header-credit-badge">
                총 {myTimetable.reduce((sum, course) => sum + (Number(course.credits) || 0), 0)}학점
              </span>
            </div>
            <div className="header-btn-group" data-html2canvas-ignore="true" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {authInfo && (
                <div style={{ display: 'flex', flexDirection: isMobileView ? 'column' : 'row', alignItems: isMobileView ? 'flex-end' : 'center', gap: isMobileView ? '4px' : '8px', marginRight: '4px' }}>
                  <span className="auth-username-text" style={{ fontSize: isMobileView ? '0.75rem' : '0.85rem', color: '#555', fontWeight: 'bold', lineHeight: '1' }}>
                    {authInfo.type === 'member' ? `👤 ${authInfo.user.username}${isMobileView ? '' : ' 님'}` : '👤 비회원'}
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {authInfo.type === 'member' && authInfo.user?.username === '77dptjd' && (
                      <button 
                        className="auth-action-btn"
                        onClick={() => setShowAdminModal(true)}
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.7rem', backgroundColor: 'var(--primary)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: 'white', flexShrink: 0 }}
                      >
                        👑 관리자
                      </button>
                    )}
                    <button
                      className="auth-action-btn"
                      onClick={() => {
                        if (authInfo.type === 'member') {
                          if (!confirm("로그아웃 하시겠습니까? 현재 화면의 시간표가 초기화됩니다.")) return;
                          localStorage.removeItem('app_user');
                          setAuthInfo(null);
                          setMyTimetable([]);
                          setSavedTimetables([]);
                        } else {
                          localStorage.removeItem('app_user');
                          setAuthInfo(null);
                        }
                      }}
                      style={{ padding: '0.35rem 0.5rem', fontSize: '0.7rem', backgroundColor: '#f0f3f7', border: '1px solid #d1d8e0', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: '#444', flexShrink: 0 }}
                    >
                      {authInfo.type === 'member' ? '로그아웃' : '로그인'}
                    </button>
                  </div>
                </div>
              )}
              <button
                className="header-action-btn btn-green"
                onClick={downloadTimetableImage}
              >
                📷 <span className="hide-on-mobile">이미지 저장</span>
              </button>
              <button
                className="header-action-btn btn-primary"
                onClick={saveTimetable}
                disabled={saving}
              >
                💾 <span className="hide-on-mobile">시간표 저장</span>
              </button>
            </div>
          </div>

          {renderTimetableGrid()}
        </section>

        <section className="glass-panel search-section" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
            <h2 className="search-title" style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0 }}>과목 검색</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="mobile-search-btn"
                onClick={() => setIsFilterCollapsed(!isFilterCollapsed)}
              >
                🔍 검색
              </button>
              <button
                onClick={() => {
                  setSearchTerm('');
                  if (authInfo?.type === 'member') {
                    handleFilterChange(setSelectedCollege, authInfo.user.college || '전체');
                    handleFilterChange(setSelectedDept, authInfo.user.department || '전체');
                  } else {
                    handleFilterChange(setSelectedCollege, '전체');
                    handleFilterChange(setSelectedDept, '전체');
                  }
                  handleFilterChange(setSelectedGrade, '전체');
                  handleFilterChange(setSelectedCredit, '전체');
                  handleFilterChange(setSelectedArea, '전체');
                  handleFilterChange(setSelectedExactSlots, []);
                  setIsFilterCollapsed(false);
                }}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: '#f0f2f5', color: '#555', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🔄 필터 초기화
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', flexShrink: 0 }}>
            <input
              type="text"
              className="search-input"
              placeholder="과목,학수번호 검색"
              value={searchTerm}
              onChange={(e) => handleFilterChange(setSearchTerm, e.target.value)}
              style={{ padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--surface-border)', outline: 'none' }}
            />

            {!isFilterCollapsed && (
              <>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    value={selectedCollege}
                    onChange={(e) => handleFilterChange(setSelectedCollege, e.target.value)}
                    style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--surface-border)', outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    <option value="전체">모든 단과대</option>
                    {Object.keys(COLLEGE_MAPPING).map(col => <option key={col} value={col}>{col}</option>)}
                  </select>

                  <select
                    value={selectedDept}
                    onChange={(e) => handleFilterChange(setSelectedDept, e.target.value)}
                    style={{
                      flex: 2,
                      padding: '0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--surface-border)',
                      outline: 'none',
                      cursor: 'pointer',
                      fontSize: selectedDept.length > 13 ? '0.75rem' : '0.85rem',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {availableDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select value={selectedGrade} onChange={(e) => handleFilterChange(setSelectedGrade, e.target.value)} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: 'none' }}>
                    <option value="전체">학년</option>
                    {["1", "2", "3", "4", "5", "6", "공통"].map(grade => <option key={grade} value={grade}>{grade === '공통' ? '공통' : grade + '학년'}</option>)}
                  </select>

                  <select value={selectedCredit} onChange={(e) => handleFilterChange(setSelectedCredit, e.target.value)} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: 'none' }}>
                    <option value="전체">학점</option>
                    {['1', '2', '3', '4', '5', '6'].map(credit => <option key={credit} value={credit}>{credit}학점</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select value={selectedCourseType} onChange={(e) => handleFilterChange(setSelectedCourseType, e.target.value)} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: 'none' }}>
                    {allCourseTypes.map(type => <option key={type} value={type}>{type === '전체' ? '이수구분 전체' : type}</option>)}
                  </select>

                  <select value={selectedArea} onChange={(e) => handleFilterChange(setSelectedArea, e.target.value)} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: 'none' }}>
                    {allAreas.map(area => <option key={area} value={area}>{area === '전체' ? '영역 전체' : area}</option>)}
                  </select>
                </div>

                <button
                  className="time-select-btn"
                  style={{ width: '100%', padding: '0.8rem', backgroundColor: isTimeSelectMode ? 'var(--primary)' : 'rgba(92, 107, 192, 0.1)', color: isTimeSelectMode ? 'white' : 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                  onClick={() => {
                    if (isMobileView && !isTimeSelectMode) {
                      setMobileTab('timetable');
                    }
                    setIsTimeSelectMode(!isTimeSelectMode);
                  }}
                >
                  {isTimeSelectMode ? '✓ 시간대 정밀 선택 적용' : '👆 원하는 시간대 정밀 선택 (현재 시간표 투명화)'}
                </button>


              </>
            )}
          </div>

          {selectedExactSlots.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', background: 'rgba(92, 107, 192, 0.05)', borderBottom: '1px solid var(--surface-border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', color: 'var(--primary)' }}>
                <input type="checkbox" checked={isStrictMode} onChange={(e) => setIsStrictMode(e.target.checked)} />
                엄격 모드 (선택 영역에 쏙 들어가는 과목)
              </label>
              <span className="hide-on-mobile" style={{ fontSize: '0.75rem', color: '#666', marginLeft: 'auto', opacity: 0.8 }}>* 시간 미지정/이러닝 제외됨</span>
              <button onClick={() => { setSelectedExactSlots([]); setIsStrictMode(false); }} style={{ background: 'transparent', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>✕ 선택 초기화</button>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }} onScroll={handleScroll}>
            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>DB 데이터 로딩중...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '0.85rem' }}>총 {filteredCourses.length}개 과목</p>
                {filteredCourses.slice(0, displayCount).map(course => {
                  const isAdded = myTimetable.some(c => c.code === course.code);
                  const isPBL = /pbl/i.test(course.detail) || /pbl/i.test(course.name);
                  const isEng = /(영어전용|영어|원어)/.test(course.detail);
                  const cleanName = course.name
                    .replace(/\(PBL\)/ig, '')
                    .replace(/\(영어\)/ig, '')
                    .replace(/\(원어\)/ig, '')
                    .trim();
                  return (
                    <div key={course.id} style={{
                      padding: '0.8rem',
                      background: isAdded ? 'rgba(200,200,200,0.3)' : 'rgba(255,255,255,0.6)',
                      border: '1px solid var(--surface-border)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: isAdded ? 'default' : 'pointer',
                      position: 'relative',
                      opacity: isAdded ? 0.6 : 1
                    }}
                      onClick={() => !isAdded && addCourse(course)}
                      onMouseEnter={(e) => {
                        if (!isAdded) e.currentTarget.style.background = 'rgba(255,255,255,0.9)';
                        setHoveredCourse(course);
                      }}
                      onMouseLeave={(e) => {
                        if (!isAdded) e.currentTarget.style.background = 'rgba(255,255,255,0.6)';
                        setHoveredCourse(null);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                        {course.course_type && <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'white', backgroundColor: '#5c6bc0', padding: '2px 5px', borderRadius: '3px' }}>{course.course_type}</span>}
                        <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--primary)', backgroundColor: 'rgba(92, 107, 192, 0.1)', padding: '1px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>{course.code}</span>
                        <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '0.9rem' }}>{cleanName}</span>
                        {isPBL && <span style={{ color: '#ff1744', marginLeft: '4px', fontWeight: '800', fontSize: '0.75rem' }}>(PBL)</span>}
                        {isEng && <span style={{ color: '#ff1744', marginLeft: '4px', fontWeight: '800', fontSize: '0.75rem' }}>(영어)</span>}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {course.department}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '0.2rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>{course.professor}</span>
                        <span style={{ color: '#ccc' }}>|</span>
                        <span>{course.credits}학점</span>
                        <span style={{ color: '#ccc' }}>|</span>
                        <span>{course.targetGrade !== '공통' ? course.targetGrade + '학년' : '공통'}</span>
                        <span style={{ color: '#ccc' }}>|</span>
                        <span>{course.timeStr || '미정'}</span>
                        <span style={{ marginLeft: 'auto', color: course.pickupCount > 0 ? '#e65100' : 'var(--text-muted)', fontWeight: '700', fontSize: '0.7rem' }}>
                          🧑‍🎓 {course.capacityTotal > 0 ? `정원 :${course.capacityTotal}명 / ${course.pickupCount}명 담음` : `${course.pickupCount}명 담음`}
                        </span>
                      </div>
                      <button style={{ position: 'absolute', top: '50%', right: '0.5rem', transform: 'translateY(-50%)', background: isAdded ? '#9e9e9e' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: isAdded ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        {isAdded ? '✓' : '+'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <div className="mobile-bottom-nav hide-on-pc">
          <button className={`nav-btn ${mobileTab === 'timetable' ? 'active' : ''}`} onClick={() => setMobileTab('timetable')}>
            <div style={{ fontSize: '1.2rem' }}>📅</div>
            <div style={{ fontSize: '0.7rem', fontWeight: '600', marginTop: '2px' }}>시간표</div>
          </button>
          <button className={`nav-btn ${mobileTab === 'search' ? 'active' : ''}`} onClick={() => setMobileTab('search')}>
            <div style={{ fontSize: '1.2rem' }}>🔍</div>
            <div style={{ fontSize: '0.7rem', fontWeight: '600', marginTop: '2px' }}>과목 검색</div>
          </button>
        </div>

        {isMobileView && isTimeSelectMode && (
          <button
            onClick={() => {
              setIsTimeSelectMode(false);
              setMobileTab('search'); // 적용 후 검색 탭으로 바로 이동하도록 추가!
            }}
            style={{ position: 'fixed', top: '15px', right: '15px', zIndex: 1100, backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '20px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer' }}
          >
            ✓ 적용하기
          </button>
        )}

        {isMobileView && mobilePreviewCourse && (
          <div style={{ position: 'fixed', bottom: 'calc(4rem + env(safe-area-inset-bottom) + 15px)', left: '15px', right: '15px', zIndex: 1100, backgroundColor: 'var(--surface-glass)', backdropFilter: 'blur(16px)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-lg)', padding: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>이 과목을 추가하시겠습니까?</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)', backgroundColor: 'rgba(92, 107, 192, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>미리보기 중</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
              <strong>{mobilePreviewCourse.name}</strong> <span style={{ color: 'var(--text-muted)' }}>({mobilePreviewCourse.professor})</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
              <button
                onClick={() => { setMobilePreviewCourse(null); setMobileTab('search'); }}
                style={{ flex: 1, padding: '0.7rem', backgroundColor: '#f0f3f7', color: 'var(--text-main)', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 'bold', cursor: 'pointer' }}
              >
                취소
              </button>
              <button
                onClick={() => {
                  executeAddCourse(mobilePreviewCourse, true);
                  setMobilePreviewCourse(null);
                  setMobileTab('search');
                }}
                style={{ flex: 1, padding: '0.7rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 'bold', cursor: 'pointer' }}
              >
                추가하기
              </button>
            </div>
          </div>
        )}

        {capturedImageUrl && (
          <div
            onClick={() => setCapturedImageUrl(null)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(10px)',
              zIndex: 2500,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '1.2rem',
                maxWidth: '90%',
                maxHeight: '85%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
                boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
                position: 'relative',
                border: '1px solid var(--surface-border)'
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#333', textAlign: 'center' }}>
                📸 이미지를 <span style={{ color: 'var(--primary)', textDecoration: 'underline' }}>길게 눌러서</span> 사진첩에 저장하세요!
              </div>

              <img
                src={capturedImageUrl}
                alt="시간표 이미지"
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '55vh',
                  borderRadius: '8px',
                  border: '1px solid var(--surface-border)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              />

              <button
                onClick={() => setCapturedImageUrl(null)}
                style={{
                  width: '100%',
                  padding: '0.8rem',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                닫기
              </button>
            </div>
          </div>
        )}
        {showAdminModal && <AdminModal onClose={() => setShowAdminModal(false)} />}
      </div>
    </>
  );
}

export default App;
