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
    try {
      const resumeData = req.body;
      
      // Create a PDF document
      const doc = new PDFDocument({ margin: 50 });
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${resumeData.personal.name.replace(/\s+/g, '_')}_resume.pdf"`);
      
      // Pipe the PDF to response
      doc.pipe(res);

      // Add content to PDF following professional resume format
      
      // Header Section
      doc.fontSize(24).font('Helvetica-Bold')
         .text(resumeData.personal.name.toUpperCase(), 50, 50, { align: 'center' });
      
      doc.fontSize(14).font('Helvetica')
         .text(resumeData.personal.title, 50, 80, { align: 'center' });
      
      // Contact Information
      let contactY = 110;
      const contactInfo = [];
      
      if (resumeData.personal.phone) {
        contactInfo.push(`Phone: ${resumeData.personal.phone}`);
      }
      if (resumeData.personal.email) {
        contactInfo.push(`Email: ${resumeData.personal.email}`);
      }
      if (resumeData.personal.location) {
        contactInfo.push(`Location: ${resumeData.personal.location}`);
      }
      if (resumeData.personal.website) {
        contactInfo.push(`Portfolio: ${resumeData.personal.website}`);
      }
      if (resumeData.personal.github) {
        contactInfo.push(`GitHub: ${resumeData.personal.github}`);
      }

      doc.fontSize(10).font('Helvetica')
         .text(contactInfo.join(' | '), 50, contactY, { align: 'center', width: 500 });
      
      let yPosition = contactY + 30;

      // Professional Summary
      if (resumeData.personal.summary) {
        doc.fontSize(12).font('Helvetica-Bold')
           .text('PROFESSIONAL SUMMARY', 50, yPosition);
        
        yPosition += 20;
        doc.fontSize(10).font('Helvetica')
           .text(resumeData.personal.summary, 50, yPosition, {
             width: 500,
             align: 'justify'
           });

        yPosition += doc.heightOfString(resumeData.personal.summary, { width: 500 }) + 20;
      }

      // Skills Section
      if (resumeData.skills && resumeData.skills.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold')
           .text('TECHNICAL SKILLS', 50, yPosition);
        
        yPosition += 20;
        const skillsByLevel = {};
        resumeData.skills.forEach(skill => {
          if (skill.name && skill.level) {
            if (!skillsByLevel[skill.level]) {
              skillsByLevel[skill.level] = [];
            }
            skillsByLevel[skill.level].push(skill.name);
          }
        });

        Object.keys(skillsByLevel).forEach(level => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }
          
          doc.fontSize(10).font('Helvetica-Bold')
             .text(`${level}:`, 50, yPosition);
          
          yPosition += 15;
          doc.fontSize(9).font('Helvetica')
             .text(skillsByLevel[level].join(', '), 70, yPosition, { width: 480 });
          
          yPosition += 20;
        });
        
        yPosition += 10;
      }

      // Education Section
      if (resumeData.education && resumeData.education.length > 0) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 50;
        }
        
        doc.fontSize(12).font('Helvetica-Bold')
           .text('EDUCATION', 50, yPosition);
        
        yPosition += 20;
        
        resumeData.education.forEach(edu => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }
          
          if (edu.institution) {
            doc.fontSize(10).font('Helvetica-Bold')
               .text(edu.institution, 50, yPosition);
            
            yPosition += 15;
          }
          
          let educationLine = '';
          if (edu.degree) educationLine += edu.degree;
          if (edu.field) educationLine += ` in ${edu.field}`;
          if (edu.duration) educationLine += ` | ${edu.duration}`;
          
          if (educationLine) {
            doc.fontSize(9).font('Helvetica')
               .text(educationLine, 50, yPosition);
            
            yPosition += 15;
          }
          
          yPosition += 10;
        });
        
        yPosition += 10;
      }

      // Experience Section
      if (resumeData.experience && resumeData.experience.length > 0) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 50;
        }
        
        doc.fontSize(12).font('Helvetica-Bold')
           .text('PROFESSIONAL EXPERIENCE', 50, yPosition);
        
        yPosition += 20;
        
        resumeData.experience.forEach(exp => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }
          
          let experienceHeader = '';
          if (exp.position) experienceHeader += exp.position;
          if (exp.company) experienceHeader += ` at ${exp.company}`;
          
          if (experienceHeader) {
            doc.fontSize(10).font('Helvetica-Bold')
               .text(experienceHeader, 50, yPosition);
            
            yPosition += 15;
          }
          
          let experienceSubheader = '';
          if (exp.duration) experienceSubheader += exp.duration;
          if (exp.location) experienceSubheader += ` | ${exp.location}`;
          
          if (experienceSubheader) {
            doc.fontSize(9).font('Helvetica')
               .text(experienceSubheader, 50, yPosition);
            
            yPosition += 15;
          }
          
          if (exp.description) {
            doc.fontSize(9)
               .text(exp.description, 50, yPosition, {
                 width: 500,
                 align: 'justify'
               });
            
            yPosition += doc.heightOfString(exp.description, { width: 500 }) + 20;
          } else {
            yPosition += 10;
          }
        });
      }

      // Projects Section
      if (resumeData.projects && resumeData.projects.length > 0) {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 50;
        }
        
        doc.fontSize(12).font('Helvetica-Bold')
           .text('PROJECTS', 50, yPosition);
        
        yPosition += 20;
        
        resumeData.projects.forEach(project => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }
          
          if (project.name) {
            doc.fontSize(10).font('Helvetica-Bold')
               .text(project.name, 50, yPosition);
            
            yPosition += 15;
          }
          
          if (project.technologies) {
            doc.fontSize(9).font('Helvetica')
               .text(`Technologies: ${project.technologies}`, 50, yPosition);
            
            yPosition += 15;
          }
          
          if (project.keyFeatures) {
            doc.fontSize(9).font('Helvetica')
               .text(`Key Features: ${project.keyFeatures}`, 50, yPosition, {
                 width: 500
               });
            
            yPosition += doc.heightOfString(project.keyFeatures, { width: 500 }) + 10;
          }
          
          // Add links if available
          let links = [];
          if (project.liveLink) links.push(`Live Demo: ${project.liveLink}`);
          if (project.githubLink) links.push(`GitHub: ${project.githubLink}`);
          
          if (links.length > 0) {
            doc.fontSize(8).font('Helvetica')
               .text(links.join(' | '), 50, yPosition, {
                 width: 500,
                 link: false // PDFKit doesn't support multiple links in one text
               });
            
            yPosition += 15;
          }
          
          if (project.description) {
            doc.fontSize(9)
               .text(project.description, 50, yPosition, {
                 width: 500,
                 align: 'justify'
               });
            
            yPosition += doc.heightOfString(project.description, { width: 500 }) + 20;
          } else {
            yPosition += 10;
          }
        });
      }

      // Add hyperlinks for contact information
      doc.fillColor('blue');
      
      // Email link
      if (resumeData.personal.email) {
        doc.text(resumeData.personal.email, 
          doc.x, 
          doc.y, 
          { link: `mailto:${resumeData.personal.email}`, underline: true }
        );
      }

      // Finalize the PDF
      doc.end();

    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ error: error.message });
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