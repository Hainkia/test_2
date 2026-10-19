const $ = selector => document.querySelector(selector);
const PAGE_SIZE = 10;
let client, user, teacher = false, saving = false, generating = false, page = 0, epoch = 0, listRequest = 0;
let selected = null;
const editor = $('#report');
function status(text) { $('#final-status').textContent = text; }
function updateButton() {
  $('#save-final').disabled = !teacher || saving || generating || !editor.value.trim();
  $('#save-final').textContent = saving ? '저장 중…' : selected ? '수정한 세특 저장' : '최종 세특 저장';
  $('#new-final').disabled = saving || generating;
}
function errorText(error) {
  if (error?.code === '42501') return '교사 저장 권한을 확인해 주세요. 다시 로그인한 뒤 시도해 주세요.';
  if (['42P01','PGRST205'].includes(error?.code)) return '최종 세특 보관함 설정이 아직 완료되지 않았습니다.';
  return '저장 또는 조회에 실패했습니다. 입력한 문장은 유지됩니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
}
function sourceId() { return $('#lesson-form').dataset.submissionId || null; }
// A changed student/course context must not retain a previous student's source link.
for (const id of ['studentId','gradeTerm','courseUnit']) {
  $('#' + id).addEventListener('input', () => { delete $('#lesson-form').dataset.submissionId; });
}
document.addEventListener('draft-generation-start', () => {generating = true; selected = null; updateButton(); status('새 초안을 작성하고 있습니다.');});
document.addEventListener('draft-generation-end', () => {generating = false; updateButton(); status('문장을 검토한 뒤 최종 세특을 저장하세요.');});
document.addEventListener('draft-text-changed', () => {updateButton(); if (selected && !saving) status('불러온 문장을 수정하면 기존 저장 기록에 반영됩니다.');});

function loadRecord(row) {
  if (saving || generating) return;
  if (editor.value.trim() && !window.confirm('현재 문장 대신 저장한 세특을 불러올까요? 저장하지 않은 수정은 사라집니다.')) return;
  selected = row;
  for (const [id,key] of [['studentId','student_number'],['gradeTerm','grade_term'],['courseUnit','course_unit']]) $('#' + id).value = row[key];
  const form = $('#lesson-form');
  delete form.dataset.submissionId;
  if (row.submission_id) form.dataset.submissionId = row.submission_id;
  // Clear another student's evidence before any later regeneration.
  for (const id of ['achievementStandard','career','careerConnection','assessmentItem','rubric','assessmentResult','evidence','project','contribution','problemSolving','competencies','observation','reflection','requiredContent','excludedContent']) $('#' + id).value = '';
  document.dispatchEvent(new CustomEvent('load-final-text', {detail:{text:row.final_text}}));
  status(`저장한 세특을 불러왔습니다. 마지막 수정: ${new Date(row.updated_at).toLocaleString('ko-KR')}. 다시 생성하려면 수업·활동 근거를 새로 입력하세요.`);
  editor.focus();
}
function listItem(row) {
  const block = document.createElement('div'); block.className = 'saved-final-item';
  const title = document.createElement('p'); title.textContent = `${row.student_number} · ${row.grade_term} · ${row.course_unit}`;
  const date = document.createElement('small'); date.textContent = `저장 ${new Date(row.created_at).toLocaleString('ko-KR')} / 수정 ${new Date(row.updated_at).toLocaleString('ko-KR')}`;
  const preview = document.createElement('p'); preview.className = 'saved-final-preview'; preview.textContent = row.final_text.slice(0,100) + (row.final_text.length > 100 ? '…' : '');
  const button = document.createElement('button'); button.type = 'button'; button.className = 'download-button'; button.textContent = '불러와 수정'; button.disabled = saving || generating;
  button.addEventListener('click', () => loadRecord(row));
  block.append(title,date,preview,button); return block;
}
async function loadList() {
  if (!teacher || !user) return;
  const version = epoch, request = ++listRequest;
  $('#final-list-status').textContent = '저장 내역을 불러오는 중…';
  $('#final-list').replaceChildren(); $('#final-previous').disabled = $('#final-next').disabled = true;
  try {
    let query = client.from('teacher_reports').select('id,submission_id,student_number,grade_term,course_unit,final_text,created_at,updated_at', {count:'exact'}).eq('teacher_id', user.id);
    if ($('#final-filter').value.trim()) query = query.eq('student_number', $('#final-filter').value.trim());
    const {data,error,count} = await query.order('updated_at', {ascending:false}).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (version !== epoch || request !== listRequest) return;
    if (error) throw error;
    $('#final-list').replaceChildren(...data.map(listItem));
    $('#final-list-status').textContent = count ? `내가 저장한 최종 세특 ${count}건` : '저장한 최종 세특이 없습니다.';
    $('#final-page').textContent = `${page + 1}페이지`;
    $('#final-previous').disabled = page === 0;
    $('#final-next').disabled = (page + 1) * PAGE_SIZE >= count;
  } catch (error) { if (version === epoch && request === listRequest) $('#final-list-status').textContent = errorText(error); }
}
async function account(session) {
  if (teacher && user && session?.user?.id === user.id) return;
  const version = ++epoch;
  user = session?.user || null; teacher = false; selected = null; page = 0; ++listRequest;
  $('#saved-final-panel').hidden = true; $('#final-list').replaceChildren(); updateButton();
  $('#final-account').replaceChildren();
  if (!user) {
    const link = document.createElement('a'); link.href = '/students.html'; link.textContent = '학생·교사 페이지에서 교사 계정으로 로그인해 주세요.';
    $('#final-account').append(link); return;
  }
  const {data,error} = await client.from('teacher_roles').select('user_id').eq('user_id',user.id).maybeSingle();
  if (version !== epoch) return;
  if (error) { $('#final-account').textContent = errorText(error); return; }
  teacher = !!data;
  $('#final-account').textContent = teacher ? `${user.email} · 교사 저장 가능` : '교사로 지정된 계정만 최종 세특을 저장할 수 있습니다.';
  $('#saved-final-panel').hidden = !teacher; updateButton();
  if (teacher) await loadList();
}
$('#save-final').addEventListener('click', async () => {
  if (!teacher || !user || saving || generating || !editor.value.trim()) return;
  const payload = {student_number:$('#studentId').value.trim(),grade_term:$('#gradeTerm').value.trim(),course_unit:$('#courseUnit').value.trim(),final_text:editor.value.trim(),submission_id:sourceId()};
  if (!payload.student_number || !payload.grade_term || !payload.course_unit) {status('학생 번호, 학년·학기, 과목·단원을 먼저 입력해 주세요.'); return;}
  if (payload.final_text.length > 10000) {status('최종 문장은 10,000자 이내로 작성해 주세요.'); return;}
  const version = epoch, savingUser = user.id, textBeforeSave = editor.value;
  saving = true; document.dispatchEvent(new CustomEvent('final-save-busy',{detail:true})); updateButton(); status('최종 세특을 저장하고 있습니다…');
  try {
    const query = selected
      ? client.from('teacher_reports').update(payload).eq('id',selected.id).eq('teacher_id',savingUser).eq('updated_at',selected.updated_at)
      : client.from('teacher_reports').insert(payload);
    const {data,error} = await query.select('id,updated_at').maybeSingle();
    if (error) throw error;
    if (version !== epoch) return;
    if (!data) {status('다른 화면에서 이 기록이 수정됐습니다. 현재 문장을 복사해 보관한 뒤, 저장 내역에서 최신 기록을 다시 불러와 주세요.'); return;}
    selected = {...payload,...data};
    status(textBeforeSave === editor.value ? '최종 세특을 DB에 저장했습니다.' : '저장한 뒤 추가로 수정한 내용이 있습니다. 저장 버튼을 다시 눌러 반영하세요.');
    page = 0; await loadList();
  } catch (error) { if (version === epoch) status(errorText(error)); }
  finally {saving = false; document.dispatchEvent(new CustomEvent('final-save-busy',{detail:false})); updateButton();}
});
$('#new-final').addEventListener('click', () => {
  if (saving || generating) return;
  if (editor.value.trim() && !window.confirm('저장한 기록은 보관하고 현재 편집 문장을 비울까요? 저장하지 않은 수정은 사라집니다.')) return;
  selected = null;
  document.dispatchEvent(new CustomEvent('load-final-text',{detail:{text:''}}));
  status('문장을 직접 작성하거나 새 초안을 생성해 주세요.'); editor.focus(); updateButton();
});
$('#final-filter-form').addEventListener('submit', event => {event.preventDefault(); page = 0; void loadList();});
$('#final-previous').addEventListener('click', () => {if (page>0) page--; void loadList();});
$('#final-next').addEventListener('click', () => {page++; void loadList();});
async function initialize() {
  try {
    const response = await fetch('/api/public-config'); const config = await response.json();
    if (!response.ok) {$('#final-account').textContent = config.error || 'DB 연결을 확인해 주세요.'; return;}
    const {createClient} = await import('https://esm.sh/@supabase/supabase-js@2.117.3');
    client = createClient(config.url,config.publishableKey,{auth:{storage:sessionStorage}});
    client.auth.onAuthStateChange((_event, session) => {setTimeout(() => {void account(session).catch(() => {$('#final-account').textContent = '로그인 상태를 다시 확인해 주세요.';});},0);});
  } catch {$('#final-account').textContent = 'DB에 연결하지 못했습니다. 문장 편집·복사·TXT 저장은 계속 사용할 수 있습니다.';}
}
void initialize();
