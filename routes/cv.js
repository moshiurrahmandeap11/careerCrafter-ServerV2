const express = require('express');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/cv-images/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  },
  fileFilter: fileFilter
});

module.exports = (db) => {
  const cvsCollection = db.collection('cvs');

  // Save CV with image upload
  router.post('/', upload.single('profileImage'), async (req, res) => {
    try {
      const cvData = {};
      
      // Parse all form data
      Object.keys(req.body).forEach(key => {
        try {
          cvData[key] = JSON.parse(req.body[key]);
        } catch (error) {
          cvData[key] = req.body[key];
        }
      });

      // Handle profile image
      if (req.file) {
        cvData.personal = cvData.personal || {};
        cvData.personal.profileImagePath = req.file.path;
        cvData.personal.profileImageFilename = req.file.filename;
      }

      const result = await cvsCollection.insertOne({
        ...cvData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      res.json({ success: true, id: result.insertedId });
    } catch (error) {
      console.error('Error saving CV:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generate PDF
  router.post('/generate-pdf', upload.single('profileImage'), async (req, res) => {
    let doc;

    try {
      const cvData = {};
      
      // Parse all form data
      Object.keys(req.body).forEach(key => {
        try {
          cvData[key] = JSON.parse(req.body[key]);
        } catch (error) {
          cvData[key] = req.body[key];
        }
      });

      // Handle temporary profile image
      let profileImagePath = null;
      if (req.file) {
        profileImagePath = req.file.path;
      }

      // Validate CV data
      if (!cvData || !cvData.personal || !cvData.personal.name) {
        return res.status(400).json({ error: 'Invalid CV data: personal name is required' });
      }

      // Create PDF document
      doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        info: {
          Title: `CV - ${cvData.personal.name}`,
          Author: cvData.personal.name,
          Subject: 'Professional CV',
          Keywords: 'CV,resume,professional,employment'
        }
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${cvData.personal.name.replace(/\s+/g, '_')}_CV.pdf"`);

      // Pipe the PDF to response
      doc.pipe(res);

      // Helper functions
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

      const getValidText = (text, defaultText = '') => {
        return text && text.toString().trim() !== '' ? text.toString().trim() : defaultText;
      };

      const formatLink = (url) => {
        if (!url) return '';
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return `https://${url}`;
        }
        return url;
      };

      let yPosition = 40;

      // ========== HEADER SECTION ==========
      // Profile Image
      if (profileImagePath && fs.existsSync(profileImagePath)) {
        try {
          doc.image(profileImagePath, 450, yPosition, {
            width: 80,
            height: 80,
            fit: [80, 80],
            align: 'right'
          });
        } catch (imageError) {
          console.warn('Could not add profile image:', imageError.message);
        }
      }

      // Name and Title
      doc.fontSize(20).font('Helvetica-Bold')
        .fillColor('#000000')
        .text(getValidText(cvData.personal.name).toUpperCase(), 50, yPosition, { align: 'left' });

      yPosition += 25;

      doc.fontSize(12).font('Helvetica')
        .fillColor('#666666')
        .text(getValidText(cvData.personal.title), 50, yPosition, { align: 'left' });

      yPosition += 30;

      // ========== CONTACT INFORMATION IN COLUMNS ==========
      const contactInfo = [];
      
      // Email
      if (hasData(cvData.personal.email)) {
        contactInfo.push({
          type: 'Email',
          value: getValidText(cvData.personal.email),
          isLink: true,
          url: `mailto:${cvData.personal.email}`
        });
      }

      // Phone
      if (hasData(cvData.personal.phone)) {
        contactInfo.push({
          type: 'Phone',
          value: getValidText(cvData.personal.phone),
          isLink: true,
          url: `tel:${cvData.personal.phone.replace(/\s+/g, '')}`
        });
      }

      // Address
      if (hasData(cvData.personal.address)) {
        contactInfo.push({
          type: 'Address',
          value: getValidText(cvData.personal.address),
          isLink: false
        });
      }

      // City
      if (hasData(cvData.personal.city)) {
        contactInfo.push({
          type: 'City',
          value: getValidText(cvData.personal.city),
          isLink: false
        });
      }

      // Country
      if (hasData(cvData.personal.country)) {
        contactInfo.push({
          type: 'Country',
          value: getValidText(cvData.personal.country),
          isLink: false
        });
      }

      // LinkedIn
      if (hasData(cvData.personal.linkedin)) {
        contactInfo.push({
          type: 'LinkedIn',
          value: getValidText(cvData.personal.linkedin),
          isLink: true,
          url: formatLink(cvData.personal.linkedin)
        });
      }

      // GitHub
      if (hasData(cvData.personal.github)) {
        contactInfo.push({
          type: 'GitHub',
          value: getValidText(cvData.personal.github),
          isLink: true,
          url: formatLink(cvData.personal.github)
        });
      }

      // Website/Portfolio
      if (hasData(cvData.personal.website)) {
        contactInfo.push({
          type: 'Portfolio',
          value: getValidText(cvData.personal.website),
          isLink: true,
          url: formatLink(cvData.personal.website)
        });
      }

      // Display contact info in 2 columns
      if (contactInfo.length > 0) {
        const columnWidth = 250;
        const rowHeight = 15;
        const startX = 50;
        
        contactInfo.forEach((contact, index) => {
          const column = index % 2;
          const row = Math.floor(index / 2);
          const xPosition = startX + (column * columnWidth);
          const currentYPosition = yPosition + (row * rowHeight);

          // Type (Email, Phone, etc.)
          doc.fontSize(8).font('Helvetica-Bold')
            .fillColor('#333333')
            .text(contact.type + ':', xPosition, currentYPosition, {
              width: 60,
              continued: false
            });

          // Value with hyperlink if applicable
          if (contact.isLink) {
            // For PDF hyperlinks, we use annotations
            doc.fontSize(8).font('Helvetica')
              .fillColor('#1155cc') // Blue color for links
              .text(contact.value, xPosition + 25, currentYPosition, {
                width: columnWidth - 30,
                link: contact.url,
                underline: true
              });
          } else {
            doc.fontSize(8).font('Helvetica')
              .fillColor('#333333')
              .text(contact.value, xPosition + 25, currentYPosition, {
                width: columnWidth - 30
              });
          }
        });

        // Calculate new yPosition based on number of rows
        const totalRows = Math.ceil(contactInfo.length / 2);
        yPosition += (totalRows * rowHeight) + 20;
      }

      // ========== PROFESSIONAL SUMMARY ==========
      if (hasData(cvData.personal.summary)) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 40;
        }

        doc.fontSize(12).font('Helvetica-Bold')
          .fillColor('#000000')
          .text('PROFESSIONAL SUMMARY', 50, yPosition);

        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        doc.fontSize(10).font('Helvetica')
          .fillColor('#000000')
          .text(getValidText(cvData.personal.summary), 50, yPosition, {
            width: 500,
            align: 'left',
            lineGap: 3
          });

        yPosition += doc.heightOfString(getValidText(cvData.personal.summary), { width: 500 }) + 20;
      }

      // ========== EDUCATION SECTION ==========
      if (hasData(cvData.education)) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 40;
        }

        doc.fontSize(12).font('Helvetica-Bold')
          .text('EDUCATION', 50, yPosition);

        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        cvData.education.forEach((edu, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 40;
          }

          // Institution and Degree
          if (hasData(edu.institution) || hasData(edu.degree)) {
            doc.fontSize(10).font('Helvetica-Bold')
              .text(getValidText(edu.institution), 50, yPosition);

            if (hasData(edu.degree)) {
              doc.fontSize(9).font('Helvetica')
                .text(getValidText(edu.degree), 250, yPosition, { align: 'right' });
            }

            yPosition += 15;
          }

          // Field of Study
          if (hasData(edu.field)) {
            doc.fontSize(9).font('Helvetica')
              .fillColor('#666666')
              .text(getValidText(edu.field), 50, yPosition);

            yPosition += 12;
          }

          // Dates and Location
          let details = [];
          if (hasData(edu.startDate)) {
            details.push(getValidText(edu.startDate));
          }
          if (hasData(edu.endDate)) {
            details.push(edu.currentlyStudying ? 'Present' : getValidText(edu.endDate));
          }
          if (hasData(edu.location)) {
            details.push(getValidText(edu.location));
          }

          if (details.length > 0) {
            doc.fontSize(8).font('Helvetica')
              .fillColor('#666666')
              .text(details.join(' | '), 50, yPosition);

            yPosition += 10;
          }

          // Description
          if (hasData(edu.description)) {
            doc.fontSize(8).font('Helvetica')
              .fillColor('#000000')
              .text(getValidText(edu.description), 50, yPosition, {
                width: 500,
                align: 'left',
                lineGap: 2
              });

            yPosition += doc.heightOfString(getValidText(edu.description), { width: 500 }) + 15;
          } else {
            yPosition += 10;
          }

          // Add space between entries
          if (index < cvData.education.length - 1) {
            doc.moveTo(50, yPosition)
              .lineTo(550, yPosition)
              .strokeColor('#e0e0e0')
              .stroke();
            yPosition += 15;
          }
        });

        yPosition += 10;
      }

      // ========== EXPERIENCE SECTION ==========
      if (hasData(cvData.experience)) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 40;
        }

        doc.fontSize(12).font('Helvetica-Bold')
          .text('PROFESSIONAL EXPERIENCE', 50, yPosition);

        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        cvData.experience.forEach((exp, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 40;
          }

          // Position and Company
          if (hasData(exp.position) || hasData(exp.company)) {
            doc.fontSize(10).font('Helvetica-Bold')
              .text(getValidText(exp.position), 50, yPosition);

            if (hasData(exp.company)) {
              doc.fontSize(9).font('Helvetica')
                .text(getValidText(exp.company), 250, yPosition, { align: 'right' });
            }

            yPosition += 15;
          }

          // Dates and Location
          let details = [];
          if (hasData(exp.startDate)) {
            details.push(getValidText(exp.startDate));
          }
          if (hasData(exp.endDate)) {
            details.push(exp.currentlyWorking ? 'Present' : getValidText(exp.endDate));
          }
          if (hasData(exp.location)) {
            details.push(getValidText(exp.location));
          }

          if (details.length > 0) {
            doc.fontSize(8).font('Helvetica')
              .fillColor('#666666')
              .text(details.join(' | '), 50, yPosition);

            yPosition += 10;
          }

          // Description
          if (hasData(exp.description)) {
            doc.fontSize(8).font('Helvetica')
              .fillColor('#000000')
              .text(getValidText(exp.description), 50, yPosition, {
                width: 500,
                align: 'left',
                lineGap: 2
              });

            yPosition += doc.heightOfString(getValidText(exp.description), { width: 500 }) + 15;
          } else {
            yPosition += 10;
          }

          // Add space between entries
          if (index < cvData.experience.length - 1) {
            doc.moveTo(50, yPosition)
              .lineTo(550, yPosition)
              .strokeColor('#e0e0e0')
              .stroke();
            yPosition += 15;
          }
        });

        yPosition += 10;
      }

      // ========== SKILLS SECTION ==========
      if (hasData(cvData.skills)) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 40;
        }

        doc.fontSize(12).font('Helvetica-Bold')
          .text('SKILLS', 50, yPosition);

        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        // Group skills by category
        const skillsByCategory = {};
        cvData.skills.forEach(skill => {
          const category = skill.category || 'Other';
          if (!skillsByCategory[category]) {
            skillsByCategory[category] = [];
          }
          skillsByCategory[category].push(skill);
        });

        Object.keys(skillsByCategory).forEach(category => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 40;
          }

          // Category title
          doc.fontSize(9).font('Helvetica-Bold')
            .text(category.toUpperCase(), 50, yPosition);

          yPosition += 12;

          // Skills in this category
          const skillsText = skillsByCategory[category]
            .map(skill => {
              let skillText = getValidText(skill.name);
              if (hasData(skill.level)) {
                skillText += ` (${getValidText(skill.level)})`;
              }
              return skillText;
            })
            .join(' • ');

          doc.fontSize(8).font('Helvetica')
            .text(skillsText, 50, yPosition, {
              width: 500,
              align: 'left'
            });

          yPosition += doc.heightOfString(skillsText, { width: 500 }) + 15;
        });

        yPosition += 10;
      }

      // ========== PROJECTS SECTION ==========
      if (hasData(cvData.projects)) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 40;
        }

        doc.fontSize(12).font('Helvetica-Bold')
          .text('PROJECTS', 50, yPosition);

        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        cvData.projects.forEach((project, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 40;
          }

          // Project Name
          if (hasData(project.name)) {
            doc.fontSize(10).font('Helvetica-Bold')
              .text(getValidText(project.name), 50, yPosition);

            yPosition += 12;
          }

          // Technologies and Role
          let details = [];
          if (hasData(project.technologies)) {
            details.push(`Tech: ${getValidText(project.technologies)}`);
          }
          if (hasData(project.role)) {
            details.push(`Role: ${getValidText(project.role)}`);
          }
          if (hasData(project.teamSize)) {
            details.push(`Team: ${getValidText(project.teamSize)}`);
          }

          if (details.length > 0) {
            doc.fontSize(8).font('Helvetica')
              .fillColor('#666666')
              .text(details.join(' | '), 50, yPosition);

            yPosition += 10;
          }

          // Dates
          if (hasData(project.startDate) || hasData(project.endDate)) {
            const dateText = `${getValidText(project.startDate)} - ${getValidText(project.endDate)}`;
            doc.fontSize(7).font('Helvetica')
              .fillColor('#666666')
              .text(dateText, 50, yPosition);

            yPosition += 8;
          }

          // Project Link (with hyperlink)
          if (hasData(project.link)) {
            const projectLink = formatLink(project.link);
            doc.fontSize(7).font('Helvetica')
              .fillColor('#1155cc')
              .text('Project Link: ', 50, yPosition, { continued: true })
              .fillColor('#1155cc')
              .text(getValidText(project.link), { 
                link: projectLink,
                underline: true
              });
            yPosition += 8;
          }

          // Description
          if (hasData(project.description)) {
            doc.fontSize(8).font('Helvetica')
              .fillColor('#000000')
              .text(getValidText(project.description), 50, yPosition, {
                width: 500,
                align: 'left',
                lineGap: 2
              });

            yPosition += doc.heightOfString(getValidText(project.description), { width: 500 }) + 15;
          } else {
            yPosition += 10;
          }

          // Add space between entries
          if (index < cvData.projects.length - 1) {
            doc.moveTo(50, yPosition)
              .lineTo(550, yPosition)
              .strokeColor('#e0e0e0')
              .stroke();
            yPosition += 15;
          }
        });

        yPosition += 10;
      }

      // ========== LANGUAGES SECTION ==========
      if (hasData(cvData.languages)) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 40;
        }

        doc.fontSize(12).font('Helvetica-Bold')
          .text('LANGUAGES', 50, yPosition);

        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        const languagesText = cvData.languages
          .map(lang => {
            let langText = getValidText(lang.name);
            if (hasData(lang.proficiency)) {
              langText += ` (${getValidText(lang.proficiency)})`;
            }
            return langText;
          })
          .join(' • ');

        doc.fontSize(9).font('Helvetica')
          .text(languagesText, 50, yPosition, {
            width: 500,
            align: 'left'
          });

        yPosition += 20;
      }

      // ========== CERTIFICATIONS SECTION ==========
      if (hasData(cvData.certifications)) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 40;
        }

        doc.fontSize(12).font('Helvetica-Bold')
          .text('CERTIFICATIONS', 50, yPosition);

        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        cvData.certifications.forEach((cert, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 40;
          }

          // Certification Name
          if (hasData(cert.name)) {
            doc.fontSize(10).font('Helvetica-Bold')
              .text(getValidText(cert.name), 50, yPosition);

            yPosition += 12;
          }

          // Issuer and Date
          let details = [];
          if (hasData(cert.issuer)) {
            details.push(getValidText(cert.issuer));
          }
          if (hasData(cert.issueDate)) {
            details.push(`Issued: ${getValidText(cert.issueDate)}`);
          }
          if (hasData(cert.expiryDate)) {
            details.push(`Expires: ${getValidText(cert.expiryDate)}`);
          }

          if (details.length > 0) {
            doc.fontSize(8).font('Helvetica')
              .fillColor('#666666')
              .text(details.join(' | '), 50, yPosition);

            yPosition += 10;
          }

          // Credential ID and Link (with hyperlink)
          if (hasData(cert.credentialId)) {
            doc.fontSize(7).font('Helvetica')
              .fillColor('#666666')
              .text(`Credential ID: ${getValidText(cert.credentialId)}`, 50, yPosition);

            yPosition += 8;
          }

          if (hasData(cert.link)) {
            const certLink = formatLink(cert.link);
            doc.fontSize(7).font('Helvetica')
              .fillColor('#1155cc')
              .text('View Certificate: ', 50, yPosition, { continued: true })
              .fillColor('#1155cc')
              .text(getValidText(cert.link), { 
                link: certLink,
                underline: true
              });
            yPosition += 8;
          }

          yPosition += 10;

          // Add space between entries
          if (index < cvData.certifications.length - 1) {
            doc.moveTo(50, yPosition)
              .lineTo(550, yPosition)
              .strokeColor('#e0e0e0')
              .stroke();
            yPosition += 15;
          }
        });
      }

      // ========== REFERENCES SECTION ==========
      if (hasData(cvData.references)) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 40;
        }

        doc.fontSize(12).font('Helvetica-Bold')
          .text('REFERENCES', 50, yPosition);

        doc.moveTo(50, yPosition + 15)
          .lineTo(550, yPosition + 15)
          .strokeColor('#333333')
          .stroke();

        yPosition += 30;

        cvData.references.forEach((ref, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 40;
          }

          // Reference Name and Position
          if (hasData(ref.name) || hasData(ref.position)) {
            doc.fontSize(10).font('Helvetica-Bold')
              .text(getValidText(ref.name), 50, yPosition);

            if (hasData(ref.position)) {
              doc.fontSize(9).font('Helvetica')
                .text(getValidText(ref.position), 250, yPosition, { align: 'right' });
            }

            yPosition += 15;
          }

          // Company and Contact
          let details = [];
          if (hasData(ref.company)) {
            details.push(getValidText(ref.company));
          }
          if (hasData(ref.email)) {
            details.push(getValidText(ref.email));
          }
          if (hasData(ref.phone)) {
            details.push(getValidText(ref.phone));
          }

          if (details.length > 0) {
            doc.fontSize(8).font('Helvetica')
              .fillColor('#666666')
              .text(details.join(' | '), 50, yPosition);

            yPosition += 10;
          }

          // LinkedIn Profile (with hyperlink)
          if (hasData(ref.linkedin)) {
            const linkedinLink = formatLink(ref.linkedin);
            doc.fontSize(7).font('Helvetica')
              .fillColor('#1155cc')
              .text('LinkedIn: ', 50, yPosition, { continued: true })
              .fillColor('#1155cc')
              .text(getValidText(ref.linkedin), { 
                link: linkedinLink,
                underline: true
              });
            yPosition += 8;
          }

          // Relationship
          if (hasData(ref.relationship)) {
            doc.fontSize(7).font('Helvetica')
              .fillColor('#666666')
              .text(`Relationship: ${getValidText(ref.relationship)}`, 50, yPosition);

            yPosition += 8;
          }

          yPosition += 10;

          // Add space between entries
          if (index < cvData.references.length - 1) {
            doc.moveTo(50, yPosition)
              .lineTo(550, yPosition)
              .strokeColor('#e0e0e0')
              .stroke();
            yPosition += 15;
          }
        });
      }

      // ========== FOOTER ==========
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

      if (doc && !doc.ended) {
        try {
          doc.end();
        } catch (endError) {
          console.error('Error ending PDF document:', endError);
        }
      }

      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      }
    } finally {
      // Clean up temporary uploaded file
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.warn('Could not clean up temporary file:', cleanupError.message);
        }
      }
    }
  });

  // Get CV by ID
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const cv = await cvsCollection.findOne({ _id: new require('mongodb').ObjectId(id) });

      if (!cv) {
        return res.status(404).json({ error: 'CV not found' });
      }

      res.json(cv);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all CVs
  router.get('/', async (req, res) => {
    try {
      const cvs = await cvsCollection.find().toArray();
      res.json(cvs);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};