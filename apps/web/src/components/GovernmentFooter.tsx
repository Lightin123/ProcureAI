import React from "react";
import { EmblemIcon } from "./GovernmentIcons.js";

export function GovernmentFooter() {
  return (
    <footer className="gov-footer" role="contentinfo">
      <div className="gov-footer__top">
        <div className="portal-container gov-footer__grid">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <EmblemIcon size={35} />
              <strong style={{ fontSize: "16px", color: "#FFFFFF" }}>ProcureAI Portal</strong>
            </div>
            <p className="gov-footer__about">
              An AI-assisted public procurement decision support platform designed to support
              government departments in discovering, evaluating, and structuring procurement
              requirements with full transparency and human oversight.
            </p>
            <p style={{ margin: 0, fontSize: "12px", color: "#B0BEC5" }}>
              Designed for <strong>Smart India Hackathon 2026 (Problem Statement SIH26136)</strong>.
            </p>
          </div>

          <div>
            <h4 className="gov-footer__heading">Related Portals</h4>
            <ul className="gov-footer__links">
              <li>
                <a href="https://gem.gov.in" target="_blank" rel="noopener noreferrer">
                  Government e-Marketplace (GeM)
                </a>
              </li>
              <li>
                <a href="https://digitalindia.gov.in" target="_blank" rel="noopener noreferrer">
                  Digital India
                </a>
              </li>
              <li>
                <a href="https://india.gov.in" target="_blank" rel="noopener noreferrer">
                  National Portal of India
                </a>
              </li>
              <li>
                <a href="https://uidai.gov.in" target="_blank" rel="noopener noreferrer">
                  UIDAI Official Portal
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="gov-footer__heading">Important Links</h4>
            <ul className="gov-footer__links">
              <li>
                <a href="#/projects">Procurement Register</a>
              </li>
              <li>
                <a href="#/status">System Diagnostics</a>
              </li>
              <li>
                <a href="#privacy">Privacy Policy</a>
              </li>
              <li>
                <a href="#terms">Terms & Conditions</a>
              </li>
              <li>
                <a href="#accessibility">Accessibility Statement</a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="gov-footer__heading">Platform Support</h4>
            <ul className="gov-footer__links">
              <li>
                <span>Helpdesk: support-procureai@gov.in</span>
              </li>
              <li>
                <span>Toll Free: 1800-11-PROCAI</span>
              </li>
              <li>
                <span>NIC Hosted Decision Support</span>
              </li>
              <li>
                <span style={{ fontSize: "11px", color: "#90A4AE" }}>Version 0.1.0 (Prototype)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="gov-footer__bottom">
        <div className="portal-container gov-footer__bottom-inner">
          <div>
            © {new Date().getFullYear()} National Informatics Centre (NIC) & Government of India. All Rights Reserved.
          </div>
          <div>
            Website Content Managed by Ministry of Commerce & Industry · Last Updated: 27-Aug-2026
          </div>
        </div>
      </div>
    </footer>
  );
}
