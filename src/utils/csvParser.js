import Papa from 'papaparse';

export const parseTimetableCSV = async (filePath) => {
  return new Promise((resolve, reject) => {
    Papa.parse(filePath, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedData = processRawData(results.data);
        resolve(parsedData);
      },
      error: (error) => {
        console.error("Error parsing CSV:", error);
        reject(error);
      }
    });
  });
};

const processRawData = (data) => {
  return data.map((row, index) => {
    const timeStr = row['수업 시간'] || '';
    const timeSlots = parseTimeStr(timeStr);
    
    return {
      id: row['학수 번호'] || `custom-${index}`,
      code: row['학수 번호'],
      name: row['교과목명'],
      professor: row['교강사'],
      credits: row['학점'],
      classification: row['영역'],
      department: row['설강학과'] || row['관장학과'] || '전체',
      timeStr: timeStr,
      room: row['강의실'],
      timeSlots: timeSlots,
      colorIndex: index % 7,
    };
  }).filter(course => course.name); // 교과목명이 없는 빈 행 제거
};

// "월(15:00-17:00)\n수(15:00-17:00)" 형태를 파싱
const parseTimeStr = (str) => {
  if (!str) return [];
  const regex = /([월화수목금토일])\s*\(([0-9]{2}:[0-9]{2})-([0-9]{2}:[0-9]{2})\)/g;
  let match;
  const slots = [];
  
  while ((match = regex.exec(str)) !== null) {
    slots.push({
      day: match[1],
      start: match[2],
      end: match[3]
    });
  }
  return slots;
};
