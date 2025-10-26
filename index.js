require('dotenv').config();

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1000ms = 1 second
const high_risk_patients = [];
const fever_patients = [];
const data_quality_issues = [];
const apikey = process.env.API_KEY;
const apiurl = process.env.API_URL;
const posturl = process.env.POST_URL;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Tries to fetch data with a limited number of retries.
 */
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const response = await fetch(url, options);

      // 1. Check for server errors (500-599)
      // These are good candidates for a retry.
      if (response.status >= 500) {
        throw new Error(`Server error! Status: ${response.status}`);
      }

      // 2. If response is OK, parse JSON and return it
      if (response.ok) {
        return await response.json();
      }

      // 3. If it's a client error (400-499), don't retry.
      // Retrying won't fix a "404 Not Found" or "401 Unauthorized".
      console.error(`Client error: ${response.status}. Stopping.`);
      // We throw a specific error to stop the loop
      throw new Error(`Client error: ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
       console.warn(`Attempt ${attempt} failed: ${error.message}`);

      // Don't wait if it was the last attempt
      if (attempt <= retries) {
        console.log(`Waiting ${RETRY_DELAY}ms before next retry...`);
        await wait(RETRY_DELAY);
      }
    }
 }
  // If the loop finishes without returning, all retries failed.
  console.error("All retry attempts failed.");
  throw lastError; // Throw the last error encountered
}


// --- Main Script Execution ---

// We wrap the main call in an async IIFE (Immediately Invoked Function Expression)
// so we can use `await` at the top level.
(async () => {
   let risk_score = 0;
   let age_risk = 0;
   let temp_risk = 0;
   let blood_risk = 0;
   const limit = 10;
 
   for (page = 1; page < 6; page++) {
     let requestUrl = `${apiurl}?page=${page}&limit=${limit}`;
    
     const fetchOptions = {
       method: 'GET',
       headers: {
         'Content-Type': 'application/json',
         'x-api-key': apikey 
       },
     }
     try {
       console.log("Fetching patient data...");
       // Call our new retry function
       const data = await fetchWithRetry(requestUrl, fetchOptions);

       // If successful, process the data
       const patients = data.data; 

       patients.forEach(patient => {
          //console.log(`Name: ${patient.name}, Age: ${patient.age}`);
         if(patient !== null || patient !== undefined) {
           
           // checking temperature
           if(typeof patient.temperature === 'number') {

            if (patient.temperature > 99.6) {
              fever_patients.push(patient.patient_id);
              if (patient.temperature > 99.6 && patient.temperature < 100.9) {
                temp_risk = 1;
              }

              if (patient.temperature > 100.9) {
                temp_risk = 2;
              }
            }
          } else {
           data_quality_issues.push(patient.patient_id);
          }
        } 
        
        //checking age
        if (typeof patient.age === 'number') {
          
          if (patient.age > 39 && patient.age < 66) {
            age_risk = 1;
          }

          if (patient.age > 66) {
            age_risk = 2;
          }

          if (patient.age > 39 && patient.age < 66) {
            age_risk = 1;
          }

          if (patient.age > 66) {
            age_risk = 2;
          }

        } else {
          data_quality_issues.push(patient.patient_id);
        }

        // checking blood pressure
        if(typeof patient.blood_pressure === 'number') {
          const pressure_items = patient.blood_pressure.split("/");
          const systolic = pressure_items[0];
          const diastolic = pressure_items[1];

          if (systolic > 119 && systolic < 130 && diastolic < 80) {
            blood_risk = 1;
          }
      
         if (systolic > 129 && systolic < 140 && diastolic > 79 && diastolic < 90) {
           blood_risk = 2;
         }

         if (systolic >= 140 && diastolic >= 90) {
           blood_risk = 3;
         }
     
         risk_score = blood_risk + age_risk + temp_risk;

         if (risk_score >= 4) {
           high_risk_patients.push(patient.patient_id);
         }
       } else {
         data_quality_issues.push(patient.patient_id);
       }
       
       risk_score = blood_risk + age_risk + temp_risk;

       if (risk_score >= 4) {
         high_risk_patients.push(patient.patient_id);
       }
    });
  } catch (error) {
    // This will catch the final error if all retries fail
    console.error("Script failed:", error.message);
  }
  console.log(`number of high temperature patients is ${fever_patients.length}`);
  console.log(`number of high risk patients is ${high_risk_patients.length}`);
  console.log(`number of patients with data quality issues is ${data_quality_issues.length}`);

  const results = {
    high_risk_patients: high_risk_patients,
    fever_patients: fever_patients,
    data_quality_issues: data_quality_issues
  };

  fetch(posturl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apikey
    },
    body: JSON.stringify(results)
  })
  .then(response => response.json())
  .then(data => {
    console.log('Assessment Results:', data);
  });
 }
})();
