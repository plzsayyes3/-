const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context=vm.createContext({
  console,
  structuredClone,
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout,
  URL,
  Blob,
  document:{querySelector(){return null},querySelectorAll(){return []}},
  localStorage:{getItem(){return null},setItem(){}},
  alert(){},
  confirm(){return true}
});

const files=['state.js','scheduler-core.js','scheduler.js','ui.js','csv-import.js','github-client.js','private-repo.js'];
for(const file of files){
  const source=fs.readFileSync(file,'utf8');
  vm.runInContext(source,context,{filename:file});
}

assert.equal(typeof context.ChildcareSchedulerCore?.generateShiftSchedule,'function');
assert.equal(typeof context.migrateLoaded,'function');
assert.equal(typeof context.renderAll,'function');
assert.equal(typeof context.bindPrivateRepo,'function');
assert.equal(typeof context.bindCsvImports,'function');

const legacy=JSON.parse(fs.readFileSync('fixtures/demo-v3.json','utf8'));
const migrated=context.migrateLoaded(legacy);
assert.equal(migrated.schemaVersion,4);
assert.ok(Array.isArray(migrated.patterns));
assert.ok(Array.isArray(migrated.staff));
assert.equal(typeof migrated.monthly,'object');

const nurse=context.normalizeStaff({id:'N1',name:'Nurse',employmentType:'正規看護師',qualified:true});
assert.deepEqual(Array.from(nurse.qualifications),['看護師']);
assert.equal(nurse.qualified,false,'legacy nurse qualified=true must not become childcare qualification');

const invalid=context.normalizeStaff({name:'missing-id'});
assert.equal(invalid.id,'','missing IDs must remain visible to validation instead of being auto-generated');

console.log('module load and v3 migration smoke test passed');
