// Quick test to verify categorizeDeliveryType function logic

function categorizeDeliveryType(courseName, deliveryType) {
  const courseNameLower = courseName.toLowerCase();
  const deliveryLower = (deliveryType || '').toLowerCase();

  // Careskills courses are Atlas
  if (courseNameLower.includes('careskills')) {
    return 'Atlas';
  }

  // Check both course name and delivery type for Online
  if (courseNameLower.includes('online') || deliveryLower.includes('online')) {
    return 'Online';
  }

  // Everything else is Face to Face
  return 'Face to Face';
}

const testCases = [
  { course: 'Careskills Phase 1', delivery: '', expected: 'Atlas' },
  { course: 'Careskills Phase 2', delivery: 'Classroom', expected: 'Atlas' },
  { course: 'GDPR 1 Online', delivery: '', expected: 'Online' },
  { course: 'First Aid', delivery: 'Online Training', expected: 'Online' },
  { course: 'First Aid', delivery: 'Face to Face', expected: 'Face to Face' },
  { course: 'Fire Safety', delivery: '', expected: 'Face to Face' },
  { course: 'Health and Safety', delivery: 'Classroom', expected: 'Face to Face' },
  { course: 'Safer Recruitment Online', delivery: '', expected: 'Online' },
];

console.log('\n✅ Testing categorizeDeliveryType function:\n');
let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
  const result = categorizeDeliveryType(test.course, test.delivery);
  const isPass = result === test.expected;
  
  if (isPass) {
    console.log(`✓ Test ${i + 1} PASS`);
    passed++;
  } else {
    console.log(`✗ Test ${i + 1} FAIL`);
    console.log(`  Course: "${test.course}"`);
    console.log(`  Delivery: "${test.delivery}"`);
    console.log(`  Expected: ${test.expected}`);
    console.log(`  Got: ${result}`);
    failed++;
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
