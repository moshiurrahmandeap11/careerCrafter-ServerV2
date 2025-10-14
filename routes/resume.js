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

      // Helper function to truncate text to fit width
      const truncateTextToFit = (text, maxWidth, doc) => {
        const ellipsis = '...';
        if (doc.widthOfString(text) <= maxWidth) {
          return text;
        }
        
        let truncated = text;
        while (truncated.length > ellipsis.length && doc.widthOfString(truncated + ellipsis) > maxWidth) {
          truncated = truncated.slice(0, -1);
        }
        return truncated + ellipsis;
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

      // Contact Information in two columns with proper spacing
      const leftColumn = [];
      const rightColumn = [];

      // Left column data - phone, email, location
      if (hasData(resumeData.personal.phone)) {
        leftColumn.push({
          text: getValidText(resumeData.personal.phone),
          type: 'phone'
        });
      }
      if (hasData(resumeData.personal.email)) {
        leftColumn.push({
          text: getValidText(resumeData.personal.email),
          type: 'email'
        });
      }
      if (hasData(resumeData.personal.location)) {
        leftColumn.push({
          text: getValidText(resumeData.personal.location),
          type: 'location'
        });
      }

      // Right column data - portfolio, github
      if (hasData(resumeData.personal.website) && resumeData.personal.website !== resumeData.personal.summary) {
        rightColumn.push({
          text: getValidText(resumeData.personal.website),
          type: 'website',
          url: getValidText(resumeData.personal.website)
        });
      }
      if (hasData(resumeData.personal.github) && resumeData.personal.github !== resumeData.personal.website) {
        rightColumn.push({
          text: getValidText(resumeData.personal.github),
          type: 'github',
          url: getValidText(resumeData.personal.github)
        });
      }

      // Calculate maximum height needed for contact section
      const maxRows = Math.max(leftColumn.length, rightColumn.length);
      const rowHeight = 15;
      const contactSectionHeight = maxRows * rowHeight;

      // Display contact info in two columns with proper boundaries
      let contactY = yPosition;

      doc.fontSize(9).font('Helvetica')
        .fillColor('#0066cc'); // Blue color for links

      // Define column boundaries
      const leftColumnX = 50;
      const rightColumnX = 300; // Middle of the page for better balance
      const maxColumnWidth = 200; // Maximum width for each column

      // Display left column items
      leftColumn.forEach((item, index) => {
        const displayText = truncateTextToFit(item.text, maxColumnWidth, doc);
        doc.text(displayText, leftColumnX, contactY + (index * rowHeight));
        
        // Add clickable links for email
        if (item.type === 'email') {
          const textWidth = doc.widthOfString(displayText, { fontSize: 9 });
          doc.link(leftColumnX, contactY + (index * rowHeight), textWidth, 10, `mailto:${item.text}`);
        }
      });

      // Display right column items
      rightColumn.forEach((item, index) => {
        const displayText = truncateTextToFit(item.text, maxColumnWidth, doc);
        doc.text(displayText, rightColumnX, contactY + (index * rowHeight));
        
        // Add clickable links for website and github
        if (item.type === 'website' || item.type === 'github') {
          const textWidth = doc.widthOfString(displayText, { fontSize: 9 });
          doc.link(rightColumnX, contactY + (index * rowHeight), textWidth, 10, item.url);
        }
      });

      // Reset text color for other content
      doc.fillColor('#000000');

      // Update yPosition based on the contact section height
      yPosition = contactY + contactSectionHeight + 20;

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

        yPosition += summaryHeight;
      }

      // ========== TECHNICAL SKILLS SECTION ==========
      if (hasData(resumeData.skills)) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 50;
        }

        // Section title
        doc.fontSize(12).font('Helvetica-Bold')
          .text('SKILLS', 50, yPosition);

        // Underline
        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        // Skills list - each skill in separate row with bullet points
        const validSkills = resumeData.skills
          .filter(skill => hasData(skill.name))
          .map(skill => getValidText(skill.name));

        if (validSkills.length > 0) {
          // Calculate layout for skills
          const skillsPerRow = 3;
          const rowHeight = 20;
          const columnWidth = 500 / skillsPerRow;
          
          let currentRow = 0;
          let currentCol = 0;

          validSkills.forEach((skill, index) => {
            // Move to next row if current row is full
            if (currentCol >= skillsPerRow) {
              currentCol = 0;
              currentRow++;
            }

            const xPosition = 50 + (currentCol * columnWidth);
            const yPositionForSkill = yPosition + (currentRow * rowHeight);

            // Bullet point
            doc.fontSize(10).font('Helvetica')
              .text('•', xPosition, yPositionForSkill);

            // Skill text
            doc.text(skill, xPosition + 10, yPositionForSkill, {
              width: columnWidth - 15,
              continued: false
            });

            currentCol++;
          });

          // Calculate total height used by skills section
          const totalRows = Math.ceil(validSkills.length / skillsPerRow);
          yPosition += (totalRows * rowHeight) + 25;
        }
      }

      // ========== PROJECTS SECTION ==========
      if (hasData(resumeData.projects)) {
        const validProjects = resumeData.projects.filter(project =>
          hasData(project.name) ||
          hasData(project.technologies) ||
          (project.features && project.features.length > 0) ||
          hasData(project.keyFeatures) ||
          hasData(project.description)
        );

        if (validProjects.length > 0) {
          if (yPosition > 650) {
            doc.addPage();
            yPosition = 50;
          }

          doc.fontSize(12).font('Helvetica-Bold')
            .text('PROJECTS', 50, yPosition);

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

            // Project Name and Links in two columns
            if (hasData(project.name)) {
              // Project name on left
              doc.fontSize(10).font('Helvetica-Bold')
                .text(getValidText(project.name), 50, projectY);

              // Links on right
              const links = [];
              if (hasData(project.liveLink)) links.push(`Live Demo`);
              if (hasData(project.githubLink)) links.push(`GitHub`);

              if (links.length > 0) {
                const linksText = links.join(' | ');
                const linksWidth = doc.widthOfString(linksText, { fontSize: 9 });
                
                doc.fontSize(9).font('Helvetica')
                  .fillColor('#0066cc')
                  .text(linksText, 550 - linksWidth, projectY);

                // Add clickable links
                let linkX = 550 - linksWidth;
                if (hasData(project.liveLink)) {
                  const liveText = "Live Demo";
                  const liveWidth = doc.widthOfString(liveText, { fontSize: 9 });
                  doc.link(linkX, projectY, liveWidth, 10, getValidText(project.liveLink));
                  linkX += liveWidth + doc.widthOfString(" | ", { fontSize: 9 });
                }
                if (hasData(project.githubLink)) {
                  const githubText = "GitHub";
                  const githubWidth = doc.widthOfString(githubText, { fontSize: 9 });
                  doc.link(linkX, projectY, githubWidth, 10, getValidText(project.githubLink));
                }
              }

              doc.fillColor('#000000');
              projectY += 15;
            }

            // Technologies
            if (hasData(project.technologies)) {
              doc.fontSize(9).font('Helvetica')
                .fillColor('#666666')
                .text(`Technologies: ${getValidText(project.technologies)}`, 50, projectY);

              projectY += 15;
            }

            // Key Features as bullet points
            const features = project.features || [];
            if (features.length > 0) {
              doc.fontSize(9).font('Helvetica')
                .fillColor('#000000')
                .text('Key Features:', 50, projectY);

              projectY += 12;

              features.forEach(feature => {
                if (hasData(feature)) {
                  // Bullet point and feature text
                  doc.text('• ', 50, projectY);
                  const featureText = getValidText(feature);
                  doc.text(featureText, 65, projectY, {
                    width: 485,
                    align: 'left',
                    lineGap: 1
                  });
                  
                  projectY += doc.heightOfString(featureText, { width: 485 }) + 5;
                }
              });
              
              projectY += 5;
            } else if (hasData(project.keyFeatures)) {
              // Fallback to old keyFeatures format
              doc.fontSize(9).font('Helvetica')
                .fillColor('#000000')
                .text(`Key Features: ${getValidText(project.keyFeatures)}`, 50, projectY, {
                  width: 500
                });

              projectY += doc.heightOfString(`Key Features: ${getValidText(project.keyFeatures)}`, { width: 500 }) + 10;
            }

            // Description
            if (hasData(project.description)) {
              doc.fontSize(9).font('Helvetica')
                .text(getValidText(project.description), 50, projectY, {
                  width: 500,
                  align: 'left',
                  lineGap: 2
                });

              projectY += doc.heightOfString(getValidText(project.description), { width: 500 }) + 15;
            }

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