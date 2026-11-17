//
//  EvaluationReset.swift
//  MarkupEditorAppLib
//

import Foundation

/// Why a running build restarted the evaluation period.
public enum EvaluationReset: Equatable, Sendable {
    /// A Beta build other than the one that started the period.
    case beta
    /// A standard build installed over a Beta.
    case afterBeta
    /// A standard build with a higher major or minor version.
    case newVersion
}
