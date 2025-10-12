const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();

module.exports = (db) => {
  const resumesCollection = db.collection('resumes');

  // Save resume
  router.post('/', async (req, res) => {
    try {
      const result = await resumesCollection.insertOne({
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      res.json({ success: true, id: result.insertedId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Generate PDF
  router.post('/generate-pdf', async (req, res) => {
    let doc;

    try {
      const resumeData = req.body;

      // Validate resume data
      if (!resumeData || !resumeData.personal || !resumeData.personal.name) {
        return res.status(400).json({ error: 'Invalid resume data: personal name is required' });
      }

      // Create a PDF document with ATS optimized margins
      doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: `Resume - ${resumeData.personal.name}`,
          Author: resumeData.personal.name,
          Subject: 'Professional Resume',
          Keywords: 'resume,CV,professional'
        }
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${resumeData.personal.name.replace(/\s+/g, '_')}_Resume.pdf"`);

      // Pipe the PDF to response
      doc.pipe(res);

      // Helper function to check if section has data
      const hasData = (section) => {
        if (!section) return false;
        if (Array.isArray(section)) {
          return section.length > 0 && section.some(item => {
            if (typeof item === 'object') {
              return Object.values(item).some(val => val && val.toString().trim() !== '');
            }
            return item && item.toString().trim() !== '';
          });
        }
        return section.toString().trim() !== '';
      };

      // Helper function to get valid text
      const getValidText = (text, defaultText = '') => {
        return text && text.toString().trim() !== '' ? text.toString().trim() : defaultText;
      };

      let yPosition = 50;

      // ========== PERSONAL INFORMATION SECTION ==========
      // Name
      doc.fontSize(18).font('Helvetica-Bold')
        .fillColor('#000000')
        .text(getValidText(resumeData.personal.name).toUpperCase(), 50, yPosition, { align: 'left' });

      yPosition += 25;

      // Title
      if (hasData(resumeData.personal.title)) {
        doc.fontSize(12).font('Helvetica')
          .fillColor('#333333')
          .text(getValidText(resumeData.personal.title), 50, yPosition, { align: 'left' });

        yPosition += 20;
      }

      // Contact Information in ATS friendly format
      const contactInfo = [];

      if (hasData(resumeData.personal.email)) {
        contactInfo.push(getValidText(resumeData.personal.email));
      }
      if (hasData(resumeData.personal.phone)) {
        contactInfo.push(getValidText(resumeData.personal.phone));
      }
      if (hasData(resumeData.personal.location)) {
        contactInfo.push(getValidText(resumeData.personal.location));
      }
      if (hasData(resumeData.personal.website) && resumeData.personal.website !== resumeData.personal.summary) {
        contactInfo.push(getValidText(resumeData.personal.website));
      }
      if (hasData(resumeData.personal.github) && resumeData.personal.github !== resumeData.personal.website) {
        contactInfo.push(getValidText(resumeData.personal.github));
      }

      if (contactInfo.length > 0) {
        doc.fontSize(9).font('Helvetica')
          .fillColor('#666666')
          .text(contactInfo.join(' | '), 50, yPosition, {
            width: 500,
            align: 'left'
          });

        yPosition += 25;
      }

      // Reset text color
      doc.fillColor('#000000');

      // ========== CAREER OBJECTIVE SECTION ==========
      if (hasData(resumeData.personal.summary) && resumeData.personal.summary !== resumeData.personal.website) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 50;
        }

        // Section title
        doc.fontSize(12).font('Helvetica-Bold')
          .text('CAREER OBJECTIVE', 50, yPosition);

        // Underline
        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        // Section content
        const summaryText = getValidText(resumeData.personal.summary);
        const summaryHeight = doc.heightOfString(summaryText, {
          width: 500,
          align: 'left',
          lineGap: 3
        });

        doc.fontSize(10).font('Helvetica')
          .text(summaryText, 50, yPosition, {
            width: 500,
            align: 'left',
            lineGap: 3
          });

        yPosition += summaryHeight + 25;
      }

      // ========== TECHNICAL SKILLS SECTION ==========
      if (hasData(resumeData.skills)) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 50;
        }

        // Section title
        doc.fontSize(12).font('Helvetica-Bold')
          .text('TECHNICAL SKILLS', 50, yPosition);

        // Underline
        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        // Skills list (only names, no levels)
        const validSkills = resumeData.skills
          .filter(skill => hasData(skill.name))
          .map(skill => getValidText(skill.name));

        if (validSkills.length > 0) {
          const skillsText = validSkills.join(' • ');

          doc.fontSize(10).font('Helvetica')
            .text(skillsText, 50, yPosition, {
              width: 500,
              align: 'left',
              lineGap: 2
            });

          yPosition += doc.heightOfString(skillsText, { width: 500 }) + 25;
        }
      }

      // ========== PROJECTS SECTION ==========
      if (hasData(resumeData.projects)) {
        const validProjects = resumeData.projects.filter(project =>
          hasData(project.name) ||
          hasData(project.technologies) ||
          hasData(project.keyFeatures) ||
          hasData(project.description)
        );

        if (validProjects.length > 0) {
          if (yPosition > 650) {
            doc.addPage();
            yPosition = 50;
          }

          doc.fontSize(12).font('Helvetica-Bold')
            .text('PROJECT EXPERIENCE', 50, yPosition);

          doc.moveTo(50, yPosition + 15)
            .lineTo(550, yPosition + 15)
            .strokeColor('#333333')
            .stroke();

          yPosition += 30;

          validProjects.forEach((project, index) => {
            if (yPosition > 700) {
              doc.addPage();
              yPosition = 50;
            }

            let projectY = yPosition;

            // Project Name
            if (hasData(project.name)) {
              doc.fontSize(10).font('Helvetica-Bold')
                .text(getValidText(project.name), 50, projectY);

              projectY += 15;
            }

            // Technologies
            if (hasData(project.technologies)) {
              doc.fontSize(9).font('Helvetica')
                .fillColor('#666666')
                .text(`Technologies: ${getValidText(project.technologies)}`, 50, projectY);

              projectY += 15;
            }

            // Key Features
            if (hasData(project.keyFeatures)) {
              doc.fontSize(9).font('Helvetica')
                .fillColor('#000000')
                .text(`Key Features: ${getValidText(project.keyFeatures)}`, 50, projectY, {
                  width: 500
                });

              projectY += doc.heightOfString(`Key Features: ${getValidText(project.keyFeatures)}`, { width: 500 }) + 10;
            }

            // Description - FIXED: Always show if it has data, regardless of content
            if (hasData(project.description)) {
              doc.fontSize(9).font('Helvetica')
                .text(getValidText(project.description), 50, projectY, {
                  width: 500,
                  align: 'left',
                  lineGap: 2
                });

              projectY += doc.heightOfString(getValidText(project.description), { width: 500 }) + 15;
            }

            // Links
            const links = [];
            if (hasData(project.liveLink)) links.push(`Live: ${getValidText(project.liveLink)}`);
            if (hasData(project.githubLink)) links.push(`GitHub: ${getValidText(project.githubLink)}`);

            if (links.length > 0) {
              doc.fontSize(8).font('Helvetica')
                .fillColor('#0066cc')
                .text(links.join(' | '), 50, projectY);

              projectY += 12;
            }

            doc.fillColor('#000000');
            yPosition = projectY;

            // Add space between projects but not after last one
            if (index < validProjects.length - 1) {
              yPosition += 10;
              doc.moveTo(50, yPosition)
                .lineTo(550, yPosition)
                .strokeColor('#e0e0e0')
                .stroke();
              yPosition += 15;
            }
          });

          yPosition += 10;
        }
      }

      // ========== EXPERIENCE SECTION ==========
      if (hasData(resumeData.experience)) {
        const validExperience = resumeData.experience.filter(exp =>
          hasData(exp.company) ||
          hasData(exp.position) ||
          (hasData(exp.description) && exp.description !== "You unlocked new Achievements with private contributions! Show them off by including private contributions in your Profile in settings.")
        );

        if (validExperience.length > 0) {
          if (yPosition > 650) {
            doc.addPage();
            yPosition = 50;
          }

          doc.fontSize(12).font('Helvetica-Bold')
            .text('PROFESSIONAL EXPERIENCE', 50, yPosition);

          doc.moveTo(50, yPosition + 15)
            .lineTo(550, yPosition + 15)
            .strokeColor('#333333')
            .stroke();

          yPosition += 30;

          validExperience.forEach((exp, index) => {
            if (yPosition > 700) {
              doc.addPage();
              yPosition = 50;
            }

            let expY = yPosition;

            // Position and Company
            let experienceHeader = [];
            if (hasData(exp.position)) experienceHeader.push(getValidText(exp.position));
            if (hasData(exp.company)) experienceHeader.push(getValidText(exp.company));

            if (experienceHeader.length > 0) {
              doc.fontSize(10).font('Helvetica-Bold')
                .text(experienceHeader.join(' - '), 50, expY);

              expY += 15;
            }

            // Duration and Location
            let experienceSubheader = [];
            if (hasData(exp.duration)) experienceSubheader.push(getValidText(exp.duration));
            if (hasData(exp.location)) experienceSubheader.push(getValidText(exp.location));

            if (experienceSubheader.length > 0) {
              doc.fontSize(9).font('Helvetica')
                .fillColor('#666666')
                .text(experienceSubheader.join(' | '), 50, expY);

              doc.fillColor('#000000');
              expY += 15;
            }

            // Description (skip default placeholder text)
            if (hasData(exp.description) && exp.description !== "You unlocked new Achievements with private contributions! Show them off by including private contributions in your Profile in settings.") {
              doc.fontSize(9)
                .text(getValidText(exp.description), 50, expY, {
                  width: 500,
                  align: 'left',
                  lineGap: 2
                });

              expY += doc.heightOfString(getValidText(exp.description), { width: 500 }) + 20;
            } else {
              expY += 10;
            }

            yPosition = expY;

            // Add space between experiences but not after last one
            if (index < validExperience.length - 1) {
              yPosition += 10;
              doc.moveTo(50, yPosition)
                .lineTo(550, yPosition)
                .strokeColor('#e0e0e0')
                .stroke();
              yPosition += 15;
            }
          });
        }
      }

      // ========== EDUCATION SECTION ==========
      if (hasData(resumeData.education)) {
        const validEducation = resumeData.education.filter(edu =>
          hasData(edu.institution) || hasData(edu.degree) || hasData(edu.field) || hasData(edu.duration)
        );

        if (validEducation.length > 0) {
          if (yPosition > 650) {
            doc.addPage();
            yPosition = 50;
          }

          doc.fontSize(12).font('Helvetica-Bold')
            .text('EDUCATION', 50, yPosition);

          doc.moveTo(50, yPosition + 15)
            .lineTo(550, yPosition + 15)
            .strokeColor('#333333')
            .stroke();

          yPosition += 30;

          validEducation.forEach((edu, index) => {
            if (yPosition > 700) {
              doc.addPage();
              yPosition = 50;
            }

            let eduY = yPosition;

            // Institution
            if (hasData(edu.institution)) {
              doc.fontSize(10).font('Helvetica-Bold')
                .text(getValidText(edu.institution), 50, eduY);

              eduY += 15;
            }

            // Degree and Field
            let educationDetails = [];
            if (hasData(edu.degree)) educationDetails.push(getValidText(edu.degree));
            if (hasData(edu.field)) educationDetails.push(getValidText(edu.field));

            if (educationDetails.length > 0) {
              doc.fontSize(9).font('Helvetica')
                .text(educationDetails.join(' in '), 50, eduY);

              eduY += 15;
            }

            // Duration
            if (hasData(edu.duration)) {
              doc.fontSize(9).font('Helvetica')
                .fillColor('#666666')
                .text(getValidText(edu.duration), 50, eduY);

              doc.fillColor('#000000');
              eduY += 15;
            }

            yPosition = eduY;

            // Add space between education entries but not after last one
            if (index < validEducation.length - 1) {
              yPosition += 10;
              doc.moveTo(50, yPosition)
                .lineTo(550, yPosition)
                .strokeColor('#e0e0e0')
                .stroke();
              yPosition += 15;
            }
          });

          yPosition += 10;
        }
      }

      // ========== LANGUAGES SECTION ==========
      if (hasData(resumeData.languages)) {
        const validLanguages = resumeData.languages.filter(lang =>
          hasData(lang.name) || hasData(lang.proficiency)
        );

        if (validLanguages.length > 0) {
          if (yPosition > 650) {
            doc.addPage();
            yPosition = 50;
          }

          doc.fontSize(12).font('Helvetica-Bold')
            .text('LANGUAGES', 50, yPosition);

          doc.moveTo(50, yPosition + 15)
            .lineTo(550, yPosition + 15)
            .strokeColor('#333333')
            .stroke();

          yPosition += 30;

          const languagesText = validLanguages.map(lang => {
            let langText = getValidText(lang.name);
            if (hasData(lang.proficiency)) {
              langText += ` (${getValidText(lang.proficiency)})`;
            }
            return langText;
          }).join(' • ');

          doc.fontSize(10).font('Helvetica')
            .text(languagesText, 50, yPosition, {
              width: 500,
              align: 'left'
            });

          yPosition += doc.heightOfString(languagesText, { width: 500 }) + 20;
        }
      }

      // ========== FOOTER ==========
      // Safe footer addition - only add if we have pages
      try {
        const pageRange = doc.bufferedPageRange();
        if (pageRange && pageRange.count > 0) {
          for (let i = 0; i < pageRange.count; i++) {
            doc.switchToPage(i);

            doc.fontSize(8)
              .fillColor('#999999')
              .text(
                `Generated on ${new Date().toLocaleDateString()}`,
                50,
                doc.page.height - 30,
                { align: 'center', width: 500 }
              );
          }
        }
      } catch (footerError) {
        console.warn('Could not add footer to PDF:', footerError.message);
      }

      // Finalize the PDF
      doc.end();

    } catch (error) {
      console.error('Error generating PDF:', error);

      // If doc exists and hasn't been ended, end it properly
      if (doc && !doc.ended) {
        try {
          doc.end();
        } catch (endError) {
          console.error('Error ending PDF document:', endError);
        }
      }

      // Only send error response if headers haven't been sent
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      }
    }
  });

  // Get resume by ID
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const resume = await resumesCollection.findOne({ _id: new require('mongodb').ObjectId(id) });

      if (!resume) {
        return res.status(404).json({ error: 'Resume not found' });
      }

      res.json(resume);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all resumes
  router.get('/', async (req, res) => {
    try {
      const resumes = await resumesCollection.find().toArray();
      res.json(resumes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};