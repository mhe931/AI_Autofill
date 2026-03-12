window.addEventListener('START_VAASA_FILL', () => {
    const rplData = {
        name: "Mohammad Hossein Ebrahimzadeh Esfahani", [cite: 18]
        email: "zdlbxd@hi2.in", [cite: 2026-03-11]
        studentNumber: "YOUR_ID",
        major: "Computing Sciences, major Artificial Intelligence and Data Engineering", [cite: 24, 39]
        prevUni: "University of Tehran", [cite: 27]
        experience: "Data Manager (Digikala Group), Marketing Data Analyst (Snapp! Express). 4+ years in senior data leadership.", [cite: 42, 48]
        competence: "Expertise in Data Governance, Airflow, Spark, Hadoop, and Polars. Authored 3 academic publications.", [cite: 46, 63, 82, 85]
        justification: "As Data Manager, I authored the first Data Governance document for Digikala. I directed BI dashboarding at Snapp!, improving decision speed by 80%. Publications include peer-reviewed work on Twitter data analysis.", [cite: 49, 67, 92, 95]
        attachments: "Social Security records, Academic Resume 1.02, Publication List 1.02.", [cite: 136, 15]
        urgency: "URGENT: Completion of studies required this semester."
    };

    const fields = document.querySelectorAll('input[type="text"], textarea');
    fields.forEach(field => {
        const containerText = field.closest('.question-container')?.innerText || "";
        if (containerText.includes("Full name")) field.value = rplData.name;
        if (containerText.includes("Student number")) field.value = rplData.studentNumber;
        if (containerText.includes("Student e-mail")) field.value = rplData.email;
        if (containerText.includes("Study Programme and Major")) field.value = rplData.major;
        if (containerText.includes("Experience")) field.value = rplData.experience;
        if (containerText.includes("Your competence")) field.value = rplData.competence;
        if (containerText.includes("correspond to the learning outcomes")) field.value = rplData.justification;
        if (containerText.includes("List of attachments")) field.value = rplData.attachments;
        if (containerText.includes("Possible additional information")) field.value = rplData.urgency;
    });
});