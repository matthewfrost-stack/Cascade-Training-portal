// Test the updated categorizeDeliveryType function

function categorizeDeliveryType(courseName, deliveryType) {
  const courseNameLower = courseName.toLowerCase();
  const deliveryLower = (deliveryType || '').toLowerCase();

  // Careskills courses are Atlas (check delivery_type first, as it's the primary source)
  if (deliveryLower.includes('careskills')) {
    return 'Atlas';
  }

  // Check both course name and delivery type for Online
  if (courseNameLower.includes('online') || deliveryLower.includes('online')) {
    return 'Online';
  }

  // Everything else is Face to Face
  return 'Face to Face';
}

// Test with the actual delivery types found
const tests = [
  { course: 'Some Course', delivery: 'Careskills \nPhase 1', expected: 'Atlas' },
  { course: 'Some Course', delivery: 'Careskills \nPhase 2', expected: 'Atlas' },
  { course: 'Some Course', delivery: 'Careskills\nPhase 2', expected: 'Atlas' },
  { course: 'Some Course', delivery: 'Online Training', expected: 'Online' },
  { course: 'Some Course', delivery: 'Online', expected: 'Online' },
  { course: 'Some Course', delivery: 'Face to Face', expected: 'Face to Face' },
  { course: 'Some Course', delivery: 'Classroom', expected: 'Face to Face' },
  { course: 'Some Course', delivery: 'Internal', expected: 'Face to Face' },
  { course: 'Some Course', delivery: 'Workshop', expected: 'Face to Face' },
  { course: 'Online Course Name', delivery: 'Face to Face', expected: 'Online' }, // Course name has 'online'
];

let passed = 0;
let failed = 0;

console.log('Testing updated categorizeDeliveryType function:\n');

tests.forEach((test, i) => {
  const result = categorizeDeliveryType(test.course, test.delivery);
  const status = result === test.expected ? '✅' : '❌';
  if (result === test.expected) {
    passed++;
  } else {
    failed++;
  }
  console.log(`${status} Test ${i + 1}: "${test.delivery}" → ${result} (expected: ${test.expected})`);
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
