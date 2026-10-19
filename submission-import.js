function studentDraftFields(record) {
  const read = (key, limit) => typeof record[key] === 'string' ? record[key].slice(0, limit) : '';
  const reported = (key, limit) => { const text = read(key, limit - 23); return text ? '[학생 자기보고 · 교사 확인 전] ' + text : ''; };
  return {
    studentId:read('student_number',30), gradeTerm:read('grade_term',40), courseUnit:read('course_unit',100),
    assessmentItem:read('activity_title',160), evidence:reported('evidence',1400), project:reported('project',900),
    contribution:reported('contribution',1200), problemSolving:reported('problem_solving',1200), reflection:reported('reflection',900),
  };
}
try {
  const stored = sessionStorage.getItem('student-evidence-import');
  if (stored) {
    sessionStorage.removeItem('student-evidence-import');
    const record = JSON.parse(stored);
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      for (const [id, text] of Object.entries(studentDraftFields(record))) document.getElementById(id).value = text;
      const note = document.createElement('p');
      note.className = 'privacy-note'; note.setAttribute('role','status');
      note.textContent = '학생 제출 기록을 불러왔습니다. 자기보고 내용을 확인하고 성취기준과 교사 관찰을 추가해 주세요.';
      document.getElementById('lesson-form').prepend(note);
    }
  }
} catch { /* The teacher can still enter evidence manually when browser storage is unavailable. */ }
